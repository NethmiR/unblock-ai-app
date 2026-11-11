import { SYSTEM_PROMPT } from "../../data/prompts/extraction.prompt.js";
import { FEW_SHOT_MESSAGES } from "../../data/prompts/extraction-few-shot.prompt.js";
import { LlmMessageRole } from "../../data/constants/llm.constant.js";
import type { LlmMessage } from "../../lib/types/ai/llm.type.js";

export function buildExtractionMessages(text: string): LlmMessage[] {
  return [
    { role: LlmMessageRole.SYSTEM, content: SYSTEM_PROMPT },
    ...FEW_SHOT_MESSAGES,
    { role: LlmMessageRole.USER, content: text },
  ];
}
