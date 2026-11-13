import { randomUUID } from "node:crypto";
import { LlmMessageRole } from "../data/constants/llm.constant.js";
import { MILLISECONDS_PER_HOUR } from "../data/constants/time.constant.js";
import {
  SELECTION_FIELD_LIMIT,
  SelectionDecisionKind,
  SelectionMessageRole,
  SelectionSessionStatus,
  SelectionTraceStep,
} from "../data/constants/selection.constant.js";
import { SELECTOR_TRANSCRIPT_MATCHED_PREFIX, type SelectorTranscriptTurn } from "../data/prompts/selector.prompt.js";
import {
  selectionOptionNotOffered,
  selectionSessionLimitReached,
  selectionSessionNotFound,
  selectionSessionNotMatched,
} from "../errors/selection-session.error.js";
import { evaluateCandidateEligibility } from "../utils/selection/candidate-eligibility.util.js";
import { buildWorkflowOverview } from "../utils/workflow/workflow-overview.util.js";
import { logger } from "../utils/shared/logger.util.js";
import type { RetrievalService } from "./retrieval.service.js";
import type { SelectorService } from "./selector.service.js";
import type { WorkflowTemplateService } from "./workflow-template.service.js";
import type { RequesterProfileService } from "./requester-profile.service.js";
import type { OrganisationCatalogueService } from "./organisation-catalogue.service.js";
import type { ISelectionSessionModel } from "../models/selection-session.model.js";
import type { WorkflowTemplateModel } from "../models/workflow-template.model.js";
import type { WorkflowTemplateVersionModel } from "../models/workflow-template-version.model.js";
import type { SelectionConfig } from "../lib/types/config/config.type.js";
import type { OrganisationCatalogue } from "../lib/types/organisation/organisation-catalogue.type.js";
import type { RequesterProfile } from "../lib/types/requester/requester.type.js";
import type { BoostedCandidate, SelectorCandidate } from "../lib/types/selection/candidate.type.js";
import type { SelectorDecision } from "../lib/types/selection/decision.type.js";
import type { WorkflowOverview } from "../lib/types/selection/overview.type.js";
import type { SelectionMatch, SelectionSessionView } from "../lib/types/selection/selection-dto.type.js";
import type {
  AssistantSelectionMessage,
  SelectionMessage,
  SelectionOption,
  SelectionSessionDocument,
  SelectionTraceEntry,
  SessionCandidate,
} from "../lib/types/selection/session.type.js";

const RETRIEVAL_QUERY_SEPARATOR = "\n";

export interface SelectionServiceOptions {
  retrievalService: Pick<RetrievalService, "retrieve">;
  selectorService: Pick<SelectorService, "decide">;
  sessionModel: ISelectionSessionModel;
  workflowTemplateService: Pick<WorkflowTemplateService, "getDefinition">;
  workflowTemplateModel: Pick<WorkflowTemplateModel, "listPublishedForCatalogue">;
  workflowTemplateVersionModel: Pick<WorkflowTemplateVersionModel, "findAudiences">;
  requesterProfileService: Pick<RequesterProfileService, "getProfile">;
  organisationCatalogueService: Pick<OrganisationCatalogueService, "getCatalogue">;
  selectionConfig: SelectionConfig;
  now?: () => Date;
}

interface SelectionContext {
  profile: RequesterProfile;
  catalogue: OrganisationCatalogue;
}

interface CandidateScreening {
  eligible: SessionCandidate[];
  trace: SelectionTraceEntry[];
}

function traceEntry(step: SelectionTraceStep, titles: readonly string[], count: number = titles.length): SelectionTraceEntry {
  return { step, count, workflow_template_titles: [...titles] };
}

function isAssistant(message: SelectionMessage): message is AssistantSelectionMessage {
  return message.role === SelectionMessageRole.ASSISTANT;
}

function lastAssistant(session: SelectionSessionDocument): AssistantSelectionMessage | null {
  return [...session.messages].reverse().find(isAssistant) ?? null;
}

function requesterTexts(session: SelectionSessionDocument): string[] {
  return session.messages.flatMap((message) => (message.role === SelectionMessageRole.REQUESTER ? [message.text] : []));
}

export class SelectionService {
  private readonly retrievalService: Pick<RetrievalService, "retrieve">;
  private readonly selectorService: Pick<SelectorService, "decide">;
  private readonly sessionModel: ISelectionSessionModel;
  private readonly workflowTemplateService: Pick<WorkflowTemplateService, "getDefinition">;
  private readonly workflowTemplateModel: Pick<WorkflowTemplateModel, "listPublishedForCatalogue">;
  private readonly workflowTemplateVersionModel: Pick<WorkflowTemplateVersionModel, "findAudiences">;
  private readonly requesterProfileService: Pick<RequesterProfileService, "getProfile">;
  private readonly organisationCatalogueService: Pick<OrganisationCatalogueService, "getCatalogue">;
  private readonly selectionConfig: SelectionConfig;
  private readonly now: () => Date;

  constructor(options: SelectionServiceOptions) {
    this.retrievalService = options.retrievalService;
    this.selectorService = options.selectorService;
    this.sessionModel = options.sessionModel;
    this.workflowTemplateService = options.workflowTemplateService;
    this.workflowTemplateModel = options.workflowTemplateModel;
    this.workflowTemplateVersionModel = options.workflowTemplateVersionModel;
    this.requesterProfileService = options.requesterProfileService;
    this.organisationCatalogueService = options.organisationCatalogueService;
    this.selectionConfig = options.selectionConfig;
    this.now = options.now ?? (() => new Date());
  }

  async start(userId: string, message: string): Promise<SelectionSessionView> {
    const context = await this.loadContext(userId);
    const now = this.now();
    const screening = await this.screen(await this.retrievalService.retrieve(message), context);
    const draft: Omit<SelectionSessionDocument, "_id"> = {
      created_by: userId,
      status: SelectionSessionStatus.OPEN,
      messages: [this.requesterMessage(message, now)],
      candidates: screening.eligible,
      rounds_used: 0,
      selected_workflow_template_id: null,
      expires_at: new Date(now.getTime() + this.selectionConfig.sessionTtlHours * MILLISECONDS_PER_HOUR),
      created_at: now,
      updated_at: now,
    };
    const trace = [traceEntry(SelectionTraceStep.PROFILE_READ, [], context.profile.facts.length), ...screening.trace];
    const decided = await this.decideAndRecord(draft, context, trace);
    const session = await this.sessionModel.insert(decided);
    return this.toView(session, context);
  }

  async postMessage(sessionId: string, userId: string, message: string): Promise<SelectionSessionView> {
    const session = await this.requireOwned(sessionId, userId);
    if (session.messages.length + 2 > SELECTION_FIELD_LIMIT.MESSAGES_PER_SESSION_MAX) throw selectionSessionLimitReached();

    const context = await this.loadContext(userId);
    const withMessage: SelectionSessionDocument = {
      ...session,
      messages: [...session.messages, this.requesterMessage(message, this.now())],
    };

    let trace: SelectionTraceEntry[];
    let candidates = session.candidates;
    if (lastAssistant(session)?.decision === SelectionDecisionKind.NO_MATCH) {
      const query = requesterTexts(withMessage).join(RETRIEVAL_QUERY_SEPARATOR);
      const screening = await this.screen(await this.retrievalService.retrieve(query), context);
      candidates = screening.eligible;
      trace = screening.trace;
    } else {
      trace = [traceEntry(SelectionTraceStep.CANDIDATES_REUSED, candidates.map((candidate) => candidate.title))];
    }

    const decided = await this.decideAndRecord({ ...withMessage, candidates }, context, trace);
    const saved: SelectionSessionDocument = { ...decided, _id: session._id };
    await this.sessionModel.replace(saved);
    return this.toView(saved, context);
  }

  async choose(sessionId: string, userId: string, workflowTemplateId: string): Promise<SelectionSessionView> {
    const session = await this.requireOwned(sessionId, userId);
    const chosen = session.candidates.find((candidate) => candidate.workflow_template_id === workflowTemplateId);
    if (!chosen) throw selectionOptionNotOffered(workflowTemplateId);

    const now = this.now();
    const saved: SelectionSessionDocument = {
      ...session,
      status: SelectionSessionStatus.MATCHED,
      selected_workflow_template_id: chosen.workflow_template_id,
      messages: [
        ...session.messages,
        this.assistantMessage(SelectionDecisionKind.MATCHED, now, {
          workflow_template_id: chosen.workflow_template_id,
          matched_fact_ids: chosen.matched_fact_ids,
        }),
      ],
      updated_at: now,
    };
    await this.sessionModel.replace(saved);
    return this.toView(saved, await this.loadContext(userId));
  }

  async get(sessionId: string, userId: string): Promise<SelectionSessionView> {
    const session = await this.requireOwned(sessionId, userId);
    return this.toView(session, await this.loadContext(userId));
  }

  async discard(sessionId: string, userId: string): Promise<void> {
    if (!(await this.sessionModel.deleteOwned(sessionId, userId))) throw selectionSessionNotFound(sessionId);
  }

  async catalogue(userId: string): Promise<WorkflowOverview[]> {
    const context = await this.loadContext(userId);
    const templates = await this.workflowTemplateModel.listPublishedForCatalogue();
    const audiences = await this.workflowTemplateVersionModel.findAudiences(
      templates.map((template) => ({ workflow_template_id: template._id, version: template.current_version })),
    );
    const eligible = templates.filter((template) => {
      const audience = audiences.get(template._id);
      return audience !== undefined && evaluateCandidateEligibility(audience, context.profile, context.catalogue).eligible;
    });
    return Promise.all(
      eligible.map(async (template) =>
        buildWorkflowOverview(
          template._id,
          await this.workflowTemplateService.getDefinition(template._id, template.current_version),
          context.catalogue,
        ),
      ),
    );
  }

  async consumeMatch(sessionId: string, userId: string): Promise<SelectionMatch> {
    const session = await this.requireOwned(sessionId, userId);
    if (session.status !== SelectionSessionStatus.MATCHED || session.selected_workflow_template_id === null) {
      throw selectionSessionNotMatched();
    }
    const titles = new Map(session.candidates.map((candidate) => [candidate.workflow_template_id, candidate.title]));
    return {
      workflowTemplateId: session.selected_workflow_template_id,
      conversation: session.messages.map((message) => ({
        role: message.role,
        text: isAssistant(message)
          ? message.question ?? (message.workflow_template_id ? titles.get(message.workflow_template_id) ?? "" : "")
          : message.text,
        sent_at: message.sent_at,
      })),
    };
  }

  async delete(sessionId: string): Promise<void> {
    await this.sessionModel.deleteById(sessionId);
  }

  private async decideAndRecord<T extends Omit<SelectionSessionDocument, "_id">>(
    session: T,
    context: SelectionContext,
    trace: SelectionTraceEntry[],
  ): Promise<T> {
    const now = this.now();
    const candidates = session.candidates;
    const isMatched = session.status === SelectionSessionStatus.MATCHED;

    if (candidates.length === 0) {
      return this.record(session, now, SelectionSessionStatus.NO_MATCH, null, session.rounds_used, this.assistantMessage(
        SelectionDecisionKind.NO_MATCH,
        now,
        { trace: [...trace, traceEntry(SelectionTraceStep.SELECTOR_NOT_NEEDED, [], 0)] },
      ));
    }

    if (!isMatched && session.rounds_used >= this.selectionConfig.maxRounds) {
      const options: SelectionOption[] = candidates.map((candidate) => ({
        id: randomUUID(),
        label: candidate.title,
        workflow_template_id: candidate.workflow_template_id,
      }));
      return this.record(session, now, session.status, session.selected_workflow_template_id, session.rounds_used, this.assistantMessage(
        SelectionDecisionKind.MANUAL_CHOICE,
        now,
        { options, trace: [...trace, traceEntry(SelectionTraceStep.ROUND_LIMIT_REACHED, options.map((option) => option.label))] },
      ));
    }

    const decision = await this.selectorService.decide({
      candidates: candidates.map((candidate) => this.toSelectorCandidate(candidate, context.catalogue)),
      transcript: this.transcript(session),
      facts: context.profile.facts,
      matchedWorkflowTemplateId: isMatched ? session.selected_workflow_template_id : null,
    });
    logger.info("selection decided", { decision: decision.decision, workflowTemplateId: decision.workflow_template_id, reasoning: decision.reasoning });
    const consulted = [...trace, traceEntry(SelectionTraceStep.SELECTOR_CONSULTED, candidates.map((candidate) => candidate.title))];
    return this.applyDecision(session, decision, consulted, now);
  }

  private applyDecision<T extends Omit<SelectionSessionDocument, "_id">>(
    session: T,
    decision: SelectorDecision,
    trace: SelectionTraceEntry[],
    now: Date,
  ): T {
    const candidate = session.candidates.find((entry) => entry.workflow_template_id === decision.workflow_template_id);
    const matchedFactIds = decision.matched_fact_ids.length > 0 ? decision.matched_fact_ids : candidate?.matched_fact_ids ?? [];

    switch (decision.decision) {
      case SelectionDecisionKind.MATCHED:
      case SelectionDecisionKind.START_REQUESTED:
        return this.record(session, now, SelectionSessionStatus.MATCHED, decision.workflow_template_id, session.rounds_used, this.assistantMessage(
          decision.decision,
          now,
          { workflow_template_id: decision.workflow_template_id, matched_fact_ids: matchedFactIds, trace },
        ));
      case SelectionDecisionKind.AMBIGUOUS:
        return this.record(session, now, SelectionSessionStatus.OPEN, null, session.rounds_used + 1, this.assistantMessage(
          SelectionDecisionKind.AMBIGUOUS,
          now,
          {
            question: decision.question,
            options: decision.options.map((label) => ({ id: randomUUID(), label, workflow_template_id: null })),
            trace,
          },
        ));
      case SelectionDecisionKind.NO_MATCH:
        return this.record(session, now, SelectionSessionStatus.NO_MATCH, null, session.rounds_used, this.assistantMessage(
          SelectionDecisionKind.NO_MATCH,
          now,
          { trace },
        ));
    }
  }

  private record<T extends Omit<SelectionSessionDocument, "_id">>(
    session: T,
    now: Date,
    status: SelectionSessionStatus,
    selected: string | null,
    roundsUsed: number,
    message: AssistantSelectionMessage,
  ): T {
    return {
      ...session,
      status,
      selected_workflow_template_id: selected,
      rounds_used: roundsUsed,
      messages: [...session.messages, message],
      updated_at: now,
    };
  }

  private assistantMessage(
    decision: SelectionDecisionKind,
    sentAt: Date,
    fields: Partial<Pick<AssistantSelectionMessage, "workflow_template_id" | "question" | "options" | "matched_fact_ids" | "trace">>,
  ): AssistantSelectionMessage {
    return {
      id: randomUUID(),
      role: SelectionMessageRole.ASSISTANT,
      decision,
      workflow_template_id: fields.workflow_template_id ?? null,
      question: fields.question ?? null,
      options: fields.options ?? [],
      matched_fact_ids: fields.matched_fact_ids ?? [],
      trace: fields.trace ?? [],
      sent_at: sentAt,
    };
  }

  private requesterMessage(text: string, sentAt: Date): SelectionMessage {
    return { id: randomUUID(), role: SelectionMessageRole.REQUESTER, text, sent_at: sentAt };
  }

  private transcript(session: Omit<SelectionSessionDocument, "_id">): SelectorTranscriptTurn[] {
    const titles = new Map(session.candidates.map((candidate) => [candidate.workflow_template_id, candidate.title]));
    return session.messages.flatMap((message): SelectorTranscriptTurn[] => {
      if (!isAssistant(message)) return [{ role: LlmMessageRole.USER, text: message.text }];
      if (message.question) return [{ role: LlmMessageRole.ASSISTANT, text: message.question }];
      const title = message.workflow_template_id ? titles.get(message.workflow_template_id) : undefined;
      return title ? [{ role: LlmMessageRole.ASSISTANT, text: `${SELECTOR_TRANSCRIPT_MATCHED_PREFIX} ${title}` }] : [];
    });
  }

  private toSelectorCandidate(candidate: SessionCandidate, catalogue: OrganisationCatalogue): SelectorCandidate {
    return {
      workflow_template_id: candidate.workflow_template_id,
      title: candidate.title,
      retrieval_summary: candidate.retrieval_summary,
      audience_unit_names: candidate.audience.organisational_unit_codes.map((code) => catalogue.unitsByCode.get(code)?.name ?? code),
    };
  }

  private async screen(retrieved: readonly BoostedCandidate[], context: SelectionContext): Promise<CandidateScreening> {
    const withSummary = retrieved.filter((candidate) => candidate.retrieval_summary !== null);
    const audiences = await this.workflowTemplateVersionModel.findAudiences(
      withSummary.map((candidate) => ({ workflow_template_id: candidate.workflow_template_id, version: candidate.workflow_template_version })),
    );
    const eligible: SessionCandidate[] = [];
    const excludedByAudience: string[] = [];
    const excludedByType: string[] = [];

    for (const candidate of withSummary) {
      const audience = audiences.get(candidate.workflow_template_id);
      if (audience === undefined || candidate.retrieval_summary === null) continue;
      const eligibility = evaluateCandidateEligibility(audience, context.profile, context.catalogue);
      if (!eligibility.eligible) {
        (eligibility.exclusion === SelectionTraceStep.EXCLUDED_BY_AUDIENCE ? excludedByAudience : excludedByType).push(candidate.title);
        continue;
      }
      eligible.push({
        workflow_template_id: candidate.workflow_template_id,
        workflow_template_version: candidate.workflow_template_version,
        title: candidate.title,
        score: candidate.score,
        alias_hits: candidate.alias_hits,
        retrieval_summary: candidate.retrieval_summary,
        audience: { actor_type: audience.actorType, organisational_unit_codes: audience.organisationalUnitCodes },
        matched_fact_ids: eligibility.matchedFactIds,
      });
    }

    const trace = [traceEntry(SelectionTraceStep.CANDIDATES_RETRIEVED, withSummary.map((candidate) => candidate.title))];
    if (excludedByAudience.length > 0) trace.push(traceEntry(SelectionTraceStep.EXCLUDED_BY_AUDIENCE, excludedByAudience));
    if (excludedByType.length > 0) trace.push(traceEntry(SelectionTraceStep.EXCLUDED_BY_REQUESTER_TYPE, excludedByType));
    return { eligible, trace };
  }

  private async loadContext(userId: string): Promise<SelectionContext> {
    const [profile, catalogue] = await Promise.all([
      this.requesterProfileService.getProfile(userId),
      this.organisationCatalogueService.getCatalogue(),
    ]);
    return { profile, catalogue };
  }

  private async requireOwned(sessionId: string, userId: string): Promise<SelectionSessionDocument> {
    const session = await this.sessionModel.findOwned(sessionId, userId);
    if (!session) throw selectionSessionNotFound(sessionId);
    return session;
  }

  private async toView(session: SelectionSessionDocument, context: SelectionContext): Promise<SelectionSessionView> {
    const matchedIds = new Set(
      session.messages.flatMap((message) =>
        isAssistant(message) && message.workflow_template_id !== null ? [message.workflow_template_id] : [],
      ),
    );
    const overviews = new Map<string, WorkflowOverview>();
    for (const candidate of session.candidates) {
      if (!matchedIds.has(candidate.workflow_template_id)) continue;
      const definition = await this.workflowTemplateService.getDefinition(candidate.workflow_template_id, candidate.workflow_template_version);
      overviews.set(candidate.workflow_template_id, buildWorkflowOverview(candidate.workflow_template_id, definition, context.catalogue));
    }
    return { session, facts: context.profile.facts, overviews };
  }
}
