import { chatClient } from "../src/services/azure-openai.client.js";
import { config } from "../src/config/index.config.js";

async function smokeTest(): Promise<string> {
  const response = await chatClient.chat.completions.create({
    model: config.azureOpenAI.deployment,
    messages: [{ role: "user", content: "Reply with only the word OK." }],
  });

  return (response.choices[0]?.message.content ?? "").trim();
}

try {
  const reply = await smokeTest();
  console.log(`Azure OpenAI connection OK — response: "${reply}"`);
} catch (err) {
  console.error("Azure OpenAI connection failed:", (err as Error).message);
  process.exitCode = 1;
}
