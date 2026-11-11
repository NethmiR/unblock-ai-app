import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { LlmMessageRole } from "../constants/llm.constant.js";
import type { LlmConversationRole } from "../../lib/types/ai/llm.type.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const inputDir = path.join(__dirname, "..", "samples", "input");
const expectedDir = path.join(__dirname, "..", "samples", "expected");

const EXAMPLES = ["it_faculty_overseas_leave", "departmental_event_workshop"] as const;

export interface FewShotMessage {
  role: LlmConversationRole;
  content: string;
}

interface FewShotExample {
  text: string;
  workflow: string;
}

function loadExample(name: string): FewShotExample {
  const text = readFileSync(path.join(inputDir, `${name}.txt`), "utf-8").trim();
  const workflow = readFileSync(path.join(expectedDir, `${name}.json`), "utf-8");
  return { text, workflow };
}

export const FEW_SHOT_MESSAGES: FewShotMessage[] = EXAMPLES.flatMap((name): FewShotMessage[] => {
  const { text, workflow } = loadExample(name);
  return [
    { role: LlmMessageRole.USER, content: text },
    { role: LlmMessageRole.ASSISTANT, content: workflow },
  ];
});
