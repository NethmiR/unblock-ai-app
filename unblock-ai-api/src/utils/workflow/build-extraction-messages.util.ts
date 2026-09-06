import { SYSTEM_PROMPT } from "../../data/prompts/extraction.prompt.js";
import { FEW_SHOT_MESSAGES, type FewShotMessage } from "../../data/prompts/extraction-few-shot.prompt.js";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export function buildExtractionMessages(text: string): ChatMessage[] {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    ...(FEW_SHOT_MESSAGES as FewShotMessage[]),
    { role: "user", content: text },
  ];
}
