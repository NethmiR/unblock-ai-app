import { buildSelectorMessages, SELECTOR_FALLBACK_QUESTION, type SelectorTranscriptTurn } from "../data/prompts/selector.prompt.js";
import { isSelectorDecision, selectionDecisionResponseSchema } from "../data/schemas/selection-decision.schema.js";
import { LlmOperation } from "../data/constants/llm.constant.js";
import { SelectionDecisionKind } from "../data/constants/selection.constant.js";
import { logger } from "../utils/shared/logger.util.js";
import { describeError } from "../utils/shared/error-description.util.js";
import { selectionFailed } from "../errors/selection-session.error.js";
import type { ILlmAdapter } from "./llm-adapter/index.llm-adapter.js";
import type { RequesterProfileFact } from "../lib/types/requester/requester.type.js";
import type { SelectorCandidate } from "../lib/types/selection/candidate.type.js";
import type { SelectorDecision } from "../lib/types/selection/decision.type.js";
import type { Confidence } from "../lib/types/workflow/workflow.type.js";

const LOW_CONFIDENCE: Confidence = "low";

export interface SelectorServiceOptions {
  llmAdapter: ILlmAdapter;
}

export interface SelectorRequest {
  candidates: readonly SelectorCandidate[];
  transcript: readonly SelectorTranscriptTurn[];
  facts: readonly RequesterProfileFact[];
  matchedWorkflowTemplateId: string | null;
}

export class SelectorService {
  private readonly llmAdapter: ILlmAdapter;

  constructor({ llmAdapter }: SelectorServiceOptions) {
    this.llmAdapter = llmAdapter;
  }

  async decide(request: SelectorRequest): Promise<SelectorDecision> {
    const matchedCandidate = request.candidates.find((candidate) => candidate.workflow_template_id === request.matchedWorkflowTemplateId) ?? null;
    const messages = buildSelectorMessages({ ...request, matchedCandidate });

    let decision: unknown;
    try {
      const completion = await this.llmAdapter.generateCompletion({
        operation: LlmOperation.WORKFLOW_SELECTION,
        messages,
        responseSchema: selectionDecisionResponseSchema,
      });
      decision = JSON.parse(completion.content);
    } catch (err) {
      logger.error("selector call failed", { error: describeError(err) });
      throw selectionFailed(err);
    }

    if (!isSelectorDecision(decision)) throw selectionFailed(new Error("Selector returned an invalid decision shape"));
    return this.sanitise(decision, request, matchedCandidate?.workflow_template_id ?? null);
  }

  private sanitise(decision: SelectorDecision, request: SelectorRequest, matchedId: string | null): SelectorDecision {
    const validIds = new Set(request.candidates.map((candidate) => candidate.workflow_template_id));
    const validFactIds = new Set(request.facts.map((fact) => fact.id));
    const facts = decision.matched_fact_ids.filter((id) => validFactIds.has(id));
    const titles = request.candidates.map((candidate) => candidate.title);
    const picksTemplate = decision.decision === SelectionDecisionKind.MATCHED || decision.decision === SelectionDecisionKind.START_REQUESTED;

    if (picksTemplate && !validIds.has(decision.workflow_template_id ?? "")) {
      logger.warn("selector returned a workflow template that was not offered", {
        returned: decision.workflow_template_id,
        offered: [...validIds],
      });
      return {
        ...decision,
        decision: SelectionDecisionKind.AMBIGUOUS,
        workflow_template_id: null,
        question: decision.question ?? SELECTOR_FALLBACK_QUESTION.UNCLEAR,
        options: [],
        matched_fact_ids: [],
      };
    }

    if (decision.decision === SelectionDecisionKind.START_REQUESTED && decision.workflow_template_id !== matchedId) {
      return { ...decision, decision: SelectionDecisionKind.MATCHED, question: null, options: [], matched_fact_ids: facts };
    }

    if (decision.decision === SelectionDecisionKind.MATCHED && decision.confidence === LOW_CONFIDENCE) {
      return {
        ...decision,
        decision: SelectionDecisionKind.AMBIGUOUS,
        workflow_template_id: null,
        question: decision.question ?? SELECTOR_FALLBACK_QUESTION.WHICH_SITUATION,
        options: decision.options.length > 0 ? decision.options : titles,
        matched_fact_ids: [],
      };
    }

    if (decision.decision === SelectionDecisionKind.AMBIGUOUS && !decision.question) {
      return { ...decision, question: SELECTOR_FALLBACK_QUESTION.WHICH_NEED, options: titles, matched_fact_ids: [] };
    }

    if (picksTemplate) return { ...decision, question: null, options: [], matched_fact_ids: facts };
    return { ...decision, workflow_template_id: null, matched_fact_ids: [] };
  }
}
