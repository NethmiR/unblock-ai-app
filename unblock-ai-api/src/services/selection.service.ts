import type { ObjectId } from "mongodb";
import { RetrievalService } from "./retrieval.service.js";
import { SelectorService } from "./selector.service.js";
import { WorkflowService } from "./workflow.service.js";
import { SelectionSessionModel } from "../models/selection-session.model.js";
import { config } from "../config/index.config.js";
import { logger } from "../utils/shared/logger.util.js";
import { SELECTION_DECISION, SESSION_OUTCOME } from "../data/constants/status.constant.js";
import { ConflictError } from "../errors/conflict.error.js";
import { ValidationError } from "../errors/validation.error.js";
import { NotFoundError } from "../errors/not-found.error.js";
import type { SelectorTranscriptTurn } from "../data/prompts/selector.prompt.js";
import type { BoostedCandidate } from "../lib/types/selection/candidate.type.js";
import type { AppliedDecision, SelectorDecision } from "../lib/types/selection/decision.type.js";
import type {
  SelectionResponseDto,
  SelectionSessionDocument,
  SessionCandidate,
} from "../lib/types/selection/session.type.js";
import type { WorkflowDefinition } from "../lib/types/workflow/workflow.type.js";

export interface SelectionServiceOptions {
  retrievalService: RetrievalService;
  selectorService: SelectorService;
  sessionModel: SelectionSessionModel;
  workflowService: WorkflowService;
  maxRounds?: number;
}

export class SelectionService {
  private readonly retrievalService: RetrievalService;
  private readonly selectorService: SelectorService;
  private readonly sessionModel: SelectionSessionModel;
  private readonly workflowService: WorkflowService;
  private readonly maxRounds: number;

  constructor({
    retrievalService,
    selectorService,
    sessionModel,
    workflowService,
    maxRounds = config.retrieval.maxSelectionRounds,
  }: SelectionServiceOptions) {
    this.retrievalService = retrievalService;
    this.selectorService = selectorService;
    this.sessionModel = sessionModel;
    this.workflowService = workflowService;
    this.maxRounds = maxRounds;
  }

  async start(
    userQuery: string,
    options: { requesterContext?: unknown; institutionType?: string | null } = {},
  ): Promise<SelectionResponseDto> {
    const candidates = await this.retrievalService.retrieve(userQuery, {
      institutionType: options.institutionType ?? null,
    });

    const now = new Date();
    const sessionCandidates: SessionCandidate[] = candidates.map((c) => ({
      workflow_id: c.workflow_id,
      version: c.version,
      title: c.title,
      score: c.score,
      base_score: c.base_score,
      alias_hits: c.alias_hits,
      retrieval_summary: c.retrieval_summary,
    }));

    const session = await this.sessionModel.insert({
      user_query: userQuery,
      candidates: sessionCandidates,
      rounds: [],
      outcome: null,
      selected_workflow_id: null,
      requester_context: options.requesterContext ?? null,
      created_at: now,
      updated_at: now,
    });

    const transcript: SelectorTranscriptTurn[] = [{ role: "user", text: userQuery }];
    const decision = await this.selectorService.decide(candidates, transcript);

    return this.apply(session, decision, candidates);
  }

  async answer(sessionId: string | ObjectId, answerText: string): Promise<SelectionResponseDto> {
    const session = await this.sessionModel.findById(sessionId);
    if (!session) throw NotFoundError.of("Selection session", String(sessionId));

    const openIndex = session.rounds.findIndex((r) => r.answer === null);
    if (openIndex === -1) {
      throw new ConflictError("No open question to answer on this session");
    }

    const updated = await this.sessionModel.setRoundAnswer(sessionId, openIndex, answerText);
    if (!updated) throw NotFoundError.of("Selection session", String(sessionId));

    const candidates = this.toBoostedCandidates(updated);

    const transcript: SelectorTranscriptTurn[] = [
      { role: "user", text: updated.user_query },
      ...updated.rounds.flatMap((r): SelectorTranscriptTurn[] => [
        { role: "assistant", text: r.question },
        ...(r.answer ? ([{ role: "user", text: r.answer }] as SelectorTranscriptTurn[]) : []),
      ]),
    ];

    // The candidate set from round one is deliberately frozen; re-running
    // retrieval here would let the candidate list drift out from under an
    // in-progress clarifying conversation.
    const decision = await this.selectorService.decide(candidates, transcript);
    return this.apply(updated, decision, candidates);
  }

  private toBoostedCandidates(session: SelectionSessionDocument): BoostedCandidate[] {
    return session.candidates.map((c) => ({
      workflow_id: c.workflow_id,
      version: c.version,
      title: c.title,
      description: "",
      score: c.score,
      aliases_lower: [],
      retrieval_summary: c.retrieval_summary,
      retrieval_text: "",
      base_score: c.base_score,
      alias_hits: c.alias_hits,
    }));
  }

  private async apply(
    session: SelectionSessionDocument,
    decision: SelectorDecision,
    candidates: BoostedCandidate[],
  ): Promise<SelectionResponseDto> {
    const sessionId = session._id;
    const roundsUsed = session.rounds?.length ?? 0;

    if (decision.decision === SELECTION_DECISION.MATCHED) {
      await this.sessionModel.finalize(sessionId, SESSION_OUTCOME.MATCHED, decision.workflow_id);
      logger.info("selection matched", {
        sessionId: String(sessionId),
        workflow_id: decision.workflow_id,
        rounds: roundsUsed,
        reasoning: decision.reasoning,
      });
      return this.toResponse(sessionId, decision, candidates);
    }

    if (decision.decision === SELECTION_DECISION.NO_MATCH) {
      await this.sessionModel.finalize(sessionId, SESSION_OUTCOME.NO_MATCH, null);
      return this.toResponse(sessionId, decision, candidates);
    }

    if (roundsUsed >= this.maxRounds) {
      logger.info("round cap reached, falling back to manual choice", {
        sessionId: String(sessionId),
        rounds: roundsUsed,
      });
      const manualChoice: AppliedDecision = {
        ...decision,
        decision: SELECTION_DECISION.MANUAL_CHOICE,
        question: "I could not narrow it down. Which of these do you want?",
        options: candidates.map((c) => c.title),
      };
      return this.toResponse(sessionId, manualChoice, candidates);
    }

    await this.sessionModel.pushRound(sessionId, {
      question: decision.question ?? "",
      options: decision.options,
      answer: null,
      asked_at: new Date(),
      answered_at: null,
    });
    return this.toResponse(sessionId, decision, candidates);
  }

  private toResponse(
    sessionId: ObjectId,
    decision: AppliedDecision,
    candidates: BoostedCandidate[],
  ): SelectionResponseDto {
    return {
      session_id: String(sessionId),
      decision: decision.decision,
      workflow_id: decision.workflow_id ?? null,
      confidence: decision.confidence,
      question: decision.question ?? null,
      options: decision.options ?? [],
      candidates: candidates.map((c) => ({
        workflow_id: c.workflow_id,
        title: c.title,
        one_liner: c.retrieval_summary?.one_liner ?? c.description ?? null,
        score: Number(c.score.toFixed(4)),
      })),
    };
  }

  async choose(sessionId: string | ObjectId, workflowId: string): Promise<{
    session_id: string;
    decision: string;
    workflow_id: string;
  }> {
    const session = await this.sessionModel.findById(sessionId);
    if (!session) throw NotFoundError.of("Selection session", String(sessionId));

    const chosen = session.candidates.find((c) => c.workflow_id === workflowId);
    if (!chosen) {
      throw new ValidationError(`'${workflowId}' was not among this session's candidates`);
    }

    await this.sessionModel.finalize(session._id, SESSION_OUTCOME.MATCHED, workflowId);
    return { session_id: String(session._id), decision: SELECTION_DECISION.MATCHED, workflow_id: workflowId };
  }

  async getMatchedWorkflow(sessionId: string | ObjectId): Promise<WorkflowDefinition> {
    const session = await this.sessionModel.findById(sessionId);
    if (!session) throw NotFoundError.of("Selection session", String(sessionId));

    if (session.selected_workflow_id === null) {
      throw new ConflictError("This session has not matched a workflow yet");
    }

    return this.workflowService.getDocument(session.selected_workflow_id);
  }
}
