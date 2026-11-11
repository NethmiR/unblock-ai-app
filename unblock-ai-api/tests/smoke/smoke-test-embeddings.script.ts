import { EmbeddingService } from "../../src/services/embedding.service.js";
import { dot } from "../../src/utils/retrieval/vector-math.util.js";
import { config } from "../../src/config/index.config.js";

const embeddingService = new EmbeddingService();

try {
  const vector = await embeddingService.embedQuery("overseas leave");
  console.log(`provider     : ${config.embedding.provider}`);
  console.log(`model        : ${embeddingService.metadata().model}`);
  console.log(`dimensions   : ${vector.length}  (expected ${config.embedding.dimensions})`);
  console.log(`unit length  : ${dot(vector, vector).toFixed(6)}  (expected 1.000000)`);
  console.log("OK embeddings");
} catch (err) {
  console.error(`${config.embedding.provider} embeddings failed:`, (err as Error).message);
  process.exitCode = 1;
}
