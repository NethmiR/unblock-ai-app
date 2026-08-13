import { EmbeddingService } from "../src/services/embedding.service.js";
import { dot } from "../src/utils/retrieval/vector-math.util.js";
import { config } from "../src/config/index.config.js";

const embeddingService = new EmbeddingService();

const [a, b] = await Promise.all([
  embeddingService.embedQuery("I want to apply for overseas leave"),
  embeddingService.embedQuery("going abroad for a conference"),
]);

console.log(`endpoint     : ${config.azureEmbedding.endpoint}`);
console.log(`deployment   : ${config.azureEmbedding.deployment}`);
console.log(`dimensions   : ${a.length}  (expected ${config.azureEmbedding.dimensions})`);
console.log(`unit length  : ${dot(a, a).toFixed(6)}  (expected 1.000000)`);
console.log(`related sim  : ${dot(a, b).toFixed(4)}  (expect > 0.4)`);
console.log(a.length === config.azureEmbedding.dimensions ? "OK embeddings" : "FAIL dimension mismatch");
