import type { AzureOpenAI } from "openai";
import { selectorChatClient } from "./azure-openai.client.js";
import { config } from "../config/index.config.js";
import { buildSelectorMessages, type SelectorTranscriptTurn } from "../data/prompts/selector.prompt.js";
import { decisionSchema, DECISION_SCHEMA_NAME } from "../data/schemas/decision.schema.js";
import { SELECTION_DECISION } from "../data/constants/status.constant.js";
import { supportsTemperatureControl } from "../data/constants/model.constant.js";
import { logger } from "../utils/shared/logger.util.js";
import { SelectionError } from "../errors/selection.error.js";
import type { BoostedCandidate } from "../lib/types/selection/candidate.type.js";
import type { SelectorDecision } from "../lib/types/selection/decision.type.js";

export interface SelectorServiceOptions {
  client?: AzureOpenAI;
  deployment?: string;
}

export class SelectorService {
  private readonly client: AzureOpenAI;
  private readonly deployment: string;

  constructor({ client = selectorChatClient, deployment = config.azureOpenAI.selectorDeployment }: SelectorServiceOptions = {}) {
    this.client = client;
    this.deployment = deployment;
  }

  async decide(candidates: BoostedCandidate[], transcript: SelectorTranscriptTurn[]): Promise<SelectorDecision> {
    if (candidates.length === 0) {
      // No candidates means retrieval found nothing selectable. Do not spend a
      // model call to be told the obvious.
      return {
        decision: SELECTION_DECISION.NO_MATCH,
        workflow_id: null,
        confidence: "high",
        question: null,
        options: [],
        reasoning: "No confirmed templates were retrieved for this query.",
      };
    }

    const messages = buildSelectorMessages({ candidates, transcript });

    let raw: SelectorDecision;
    try {
      const response = await this.client.chat.completions.create({
        model: this.deployment,
        messages,
        response_format: {
          type: "json_schema",
          json_schema: { name: DECISION_SCHEMA_NAME, schema: decisionSchema, strict: true },
        },
        ...(supportsTemperatureControl(this.deployment) ? { temperature: 0 } : {}),
      });
      raw = JSON.parse(response.choices[0]?.message.content ?? "{}") as SelectorDecision;
    } catch (err) {
      throw new SelectionError(`Selector call failed: ${(err as Error).message}`, { cause: err });
    }

    return this.sanitize(raw, candidates);
  }

  private sanitize(decision: SelectorDecision, candidates: BoostedCandidate[]): SelectorDecision {
    const validIds = new Set(candidates.map((c) => c.workflow_id));

    if (decision.decision === SELECTION_DECISION.MATCHED && !validIds.has(decision.workflow_id ?? "")) {
      logger.warn("selector hallucinated a workflow_id", {
        returned: decision.workflow_id,
        offered: [...validIds],
      });
      return {
        ...decision,
        decision: SELECTION_DECISION.AMBIGUOUS,
        workflow_id: null,
        question: decision.question ?? "Could you describe what you need in a bit more detail?",
        options: [],
      };
    }

    if (decision.decision === SELECTION_DECISION.MATCHED && decision.confidence === "low") {
      logger.info("downgrading low-confidence match to ambiguous", {
        workflow_id: decision.workflow_id,
      });
      return {
        ...decision,
        decision: SELECTION_DECISION.AMBIGUOUS,
        workflow_id: null,
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
