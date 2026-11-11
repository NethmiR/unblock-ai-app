import { createLlmAdapter } from "../../src/services/llm-adapter/index.llm-adapter.js";
import { config } from "../../src/config/index.config.js";
import { LlmMessageRole } from "../../src/data/constants/llm.constant.js";

const llmAdapter = createLlmAdapter(config.llm);

try {
  const completion = await llmAdapter.generateCompletion({
    messages: [{ role: LlmMessageRole.USER, content: "Reply with only the word OK." }],
  });
  console.log(`${config.llm.provider} (${llmAdapter.modelName}) connection OK — response: "${completion.content.trim()}"`);
} catch (err) {
  console.error(`${config.llm.provider} (${llmAdapter.modelName}) connection failed:`, (err as Error).message);
  process.exitCode = 1;
}
