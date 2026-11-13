import { createLlmAdapters } from "../../src/services/llm-adapter/index.llm-adapter.js";
import { config } from "../../src/config/index.config.js";
import { LlmMessageRole, LlmOperation } from "../../src/data/constants/llm.constant.js";

const llmAdapter = createLlmAdapters(config.llm)[LlmOperation.WORKFLOW_TEMPLATE_GENERATION];

try {
  const completion = await llmAdapter.generateCompletion({
    operation: LlmOperation.WORKFLOW_TEMPLATE_GENERATION,
    messages: [{ role: LlmMessageRole.USER, content: "Reply with only the word OK." }],
  });
  console.log(`${config.llm.provider} (${llmAdapter.modelName}) connection OK — response: "${completion.content.trim()}"`);
} catch (err) {
  console.error(`${config.llm.provider} (${llmAdapter.modelName}) connection failed:`, (err as Error).message);
  process.exitCode = 1;
}
