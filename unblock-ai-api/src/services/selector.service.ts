import { createLlmAdapter, type ILlmAdapter } from "./llm-adapter/index.llm-adapter.js";
import { config } from "../config/index.config.js";
import { buildSelectorMessages, type SelectorTranscriptTurn } from "../data/prompts/selector.prompt.js";
import { decisionResponseSchema, isSelectorDecision } from "../data/schemas/decision.schema.js";
import { SELECTION_DECISION } from "../data/constants/status.constant.js";
import { logger } from "../utils/shared/logger.util.js";
import { SelectionError } from "../errors/selection.error.js";
import type { BoostedCandidate } from "../lib/types/selection/candidate.type.js";
import type { SelectorDecision } from "../lib/types/selection/decision.type.js";

export interface SelectorServiceOptions {
  llmAdapter?: ILlmAdapter;
}

export class SelectorService {
  private readonly llmAdapter: ILlmAdapter;

  constructor({ llmAdapter = createLlmAdapter(config.llm) }: SelectorServiceOptions = {}) {
    this.llmAdapter = llmAdapter;
  }

  async decide(candidates: BoostedCandidate[], transcript: SelectorTranscriptTurn[]): Promise<SelectorDecision> {
    if (candidates.length === 0) {
      // No candidates means retrieval found nothing selectable. Do not spend a
      // model call to be told the obvious.
      return {
        decision: SELECTION_DECISION.NO_MATCH,
        workflow_template_id: null,
        confidence: "high",
        question: null,
        options: [],
        reasoning: "No published workflow templates were retrieved for this query.",
      };
    }

    const messages = buildSelectorMessages({ candidates, transcript });

    let decision: unknown;
    try {
      const completion = await this.llmAdapter.generateCompletion({ messages, responseSchema: decisionResponseSchema });
      decision = JSON.parse(completion.content);
    } catch (err) {
      throw new SelectionError(`Selector call failed: ${(err as Error).message}`, { cause: err });
    }

    if (!isSelectorDecision(decision)) {
      throw new SelectionError("Selector returned a decision that does not match the decision schema");
    }
    return this.sanitize(decision, candidates);
  }

  private sanitize(decision: SelectorDecision, candidates: BoostedCandidate[]): SelectorDecision {
    const validIds = new Set(candidates.map((c) => c.workflow_template_id));

    if (decision.decision === SELECTION_DECISION.MATCHED && !validIds.has(decision.workflow_template_id ?? "")) {
      logger.warn("selector hallucinated a workflow_template_id", {
        returned: decision.workflow_template_id,
        offered: [...validIds],
      });
      return {
        ...decision,
        decision: SELECTION_DECISION.AMBIGUOUS,
        workflow_template_id: null,
        question: decision.question ?? "Could you describe what you need in a bit more detail?",
        options: [],
      };
    }

    if (decision.decision === SELECTION_DECISION.MATCHED && decision.confidence === "low") {
      logger.info("downgrading low-confidence match to ambiguous", {
        workflow_template_id: decision.workflow_template_id,
      });
      return {
        ...decision,
        decision: SELECTION_DECISION.AMBIGUOUS,
        workflow_template_id: null,
        question: decision.question ?? "Which of these best describes your situation?",
        options: decision.options?.length ? decision.options : candidates.map((c) => c.title),
      };
    }

    if (decision.decision === SELECTION_DECISION.AMBIGUOUS && !decision.question) {
      return {
        ...decision,
        question: "Which of these best describes what you need?",
        options: candidates.map((c) => c.title),
      };
    }

    return decision;
  }
}
