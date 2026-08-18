import type { IndexDescription } from "mongodb";
import { COLLECTIONS } from "../data/constants/collection.constant.js";
import { getDb } from "./mongo.client.js";
import { logger } from "../utils/shared/logger.util.js";

interface IndexSpec {
  collection: string;
  keys: IndexDescription["key"];
  options: Omit<IndexDescription, "key">;
}

const INDEX_SPECS: IndexSpec[] = [
  {
    collection: COLLECTIONS.DRAFTS,
    keys: { text_sha256: 1 },
    options: { unique: true, name: "draft_text_sha256_unique" },
  },
  {
    collection: COLLECTIONS.DRAFTS,
    keys: { created_at: -1 },
    options: { name: "draft_created_desc" },
  },
  {
    collection: COLLECTIONS.TEMPLATES,
    keys: { workflow_id: 1, version: 1 },
    options: { unique: true, name: "template_id_version_unique" },
  },
  {
    collection: COLLECTIONS.TEMPLATES,
    keys: { workflow_id: 1, is_latest: 1 },
    options: { name: "template_latest" },
  },
  {
    collection: COLLECTIONS.TEMPLATES,
    keys: { is_latest: 1, review_status: 1, institution_type: 1 },
    options: { name: "template_retrieval_filter" },
  },
  {
    collection: COLLECTIONS.SELECTION_SESSIONS,
    keys: { created_at: -1 },
    options: { name: "session_created_desc" },
  },
  {
    collection: COLLECTIONS.TASKS,
    keys: { session_id: 1 },
    options: { name: "task_session" },
  },
  {
    collection: COLLECTIONS.TASKS,
    keys: { status: 1, created_at: -1 },
    options: { name: "task_status_created" },
  },
  {
    collection: COLLECTIONS.TASKS,
    keys: { reference: 1 },
    options: { unique: true, name: "task_reference_unique" },
  },
  {
    collection: COLLECTIONS.TASKS,
    keys: { "steps.approval_token": 1 },
    options: { name: "task_step_token", sparse: true },
  },
];

export async function ensureIndexes(): Promise<void> {
  const db = await getDb();
  for (const { collection, keys, options } of INDEX_SPECS) {
    await db.collection(collection).createIndex(keys, options);
  }
  logger.info("mongo indexes ensured", { count: INDEX_SPECS.length });
}
