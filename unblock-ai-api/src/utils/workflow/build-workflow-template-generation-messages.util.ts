import { WORKFLOW_TEMPLATE_GENERATION_SYSTEM_PROMPT } from "../../data/prompts/workflow-template-generation.prompt.js";
import { WORKFLOW_TEMPLATE_GENERATION_FEW_SHOT_MESSAGES } from "../../data/prompts/workflow-template-generation-few-shot.prompt.js";
import { LlmMessageRole } from "../../data/constants/llm.constant.js";
import type { LlmMessage } from "../../lib/types/ai/llm.type.js";

export function buildWorkflowTemplateGenerationMessages(prompt: string): LlmMessage[] {
  return [
    { role: LlmMessageRole.SYSTEM, content: WORKFLOW_TEMPLATE_GENERATION_SYSTEM_PROMPT },
    ...WORKFLOW_TEMPLATE_GENERATION_FEW_SHOT_MESSAGES,
    { role: LlmMessageRole.USER, content: prompt },
  ];
}
