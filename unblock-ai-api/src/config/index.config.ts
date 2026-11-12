import { server } from "./server.config.js";
import { db } from "./db.config.js";
import { postgres } from "./postgres.config.js";
import { llm } from "./llm.config.js";
import { embedding } from "./embedding.config.js";
import { workflowTemplateGeneration } from "./workflow-template-generation.config.js";
import { retrieval } from "./retrieval.config.js";
import { mail } from "./mail.config.js";
import { auth } from "./auth.config.js";
import { user } from "./user.config.js";
import { document } from "./document.config.js";
import type { AppConfig } from "../lib/types/config/config.type.js";

export const config: AppConfig = Object.freeze({
  server,
  db,
  postgres,
  llm,
  embedding,
  workflowTemplateGeneration,
  retrieval,
  mail,
  auth,
  user,
  document,
});
