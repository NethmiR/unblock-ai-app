import { server } from "./server.config.js";
import { db } from "./db.config.js";
import { postgres } from "./postgres.config.js";
import { azureOpenAI } from "./azure-openai.config.js";
import { azureEmbedding } from "./azure-embedding.config.js";
import { retrieval } from "./retrieval.config.js";
import { mail } from "./mail.config.js";
import { auth } from "./auth.config.js";
import { document } from "./document.config.js";
import type { AppConfig } from "../lib/types/config/config.type.js";

export const config: AppConfig = Object.freeze({
  server,
  db,
  postgres,
  azureOpenAI,
  azureEmbedding,
  retrieval,
  mail,
  auth,
  document,
});
