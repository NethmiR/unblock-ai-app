import type { IndexDescription } from "mongodb";
import type { MongoMigration } from "../../../../lib/types/migration/index.type.js";

const COLLECTION_INDEXES: ReadonlyArray<[collection: string, indexes: IndexDescription[]]> = [
  [
    "drafts",
    [
      { key: { text_sha256: 1 }, name: "draft_text_sha256_unique", unique: true },
      { key: { created_at: -1 }, name: "draft_created_desc" },
    ],
  ],
  [
    "templates",
    [
      { key: { workflow_id: 1, version: 1 }, name: "template_id_version_unique", unique: true },
      { key: { workflow_id: 1, is_latest: 1 }, name: "template_latest" },
      { key: { is_latest: 1, review_status: 1, institution_type: 1 }, name: "template_retrieval_filter" },
    ],
  ],
  [
    "selection_sessions",
    [{ key: { created_at: -1 }, name: "session_created_desc" }],
  ],
  [
    "tasks",
    [
      { key: { reference: 1 }, name: "task_reference_unique", unique: true },
      { key: { session_id: 1 }, name: "task_session" },
      { key: { status: 1, created_at: -1 }, name: "task_status_created" },
      { key: { created_by: 1, created_at: -1 }, name: "task_created_by_created" },
      { key: { workflow_id: 1, status: 1 }, name: "task_workflow_status" },
      { key: { "steps.approval_token": 1 }, name: "task_step_token", sparse: true },
    ],
  ],
  ["counters", []],
  [
    "audit_logs",
    [{ key: { resource: 1, resource_id: 1, created_at: -1 }, name: "audit_resource_created" }],
  ],
];

const migration: MongoMigration = {
  async up({ db }) {
    for (const [collection, indexes] of COLLECTION_INDEXES) {
      await db.createCollection(collection);
      if (indexes.length > 0) await db.collection(collection).createIndexes(indexes);
    }
  },

  async down({ db }) {
    for (const [collection] of [...COLLECTION_INDEXES].reverse()) {
      await db.dropCollection(collection);
    }
  },
};

export default migration;
