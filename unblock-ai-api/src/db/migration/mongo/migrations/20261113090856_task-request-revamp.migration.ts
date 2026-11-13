import type { Db, IndexDescription } from "mongodb";
import type { MongoMigration } from "../../../../lib/types/migration/index.type.js";

const TASK_INDEXES: IndexDescription[] = [
  { key: { reference: 1 }, name: "task_reference_unique", unique: true },
  { key: { created_by: 1, updated_at: -1 }, name: "task_created_by_updated" },
  { key: { created_by: 1, status: 1 }, name: "task_created_by_status" },
  { key: { workflow_template_id: 1, status: 1 }, name: "task_workflow_template_status" },
  {
    key: { "steps.approval.token_hash": 1 },
    name: "task_approval_token_hash",
    partialFilterExpression: { "steps.approval.token_hash": { $type: "string" } },
  },
];

async function collectionExists(db: Db, name: string): Promise<boolean> {
  return (await db.listCollections({ name }, { nameOnly: true }).toArray()).length > 0;
}

const migration: MongoMigration = {
  async up({ db }) {
    if (await collectionExists(db, "tasks")) await db.renameCollection("tasks", "legacy_tasks");
    await db.createCollection("tasks");
    await db.collection("tasks").createIndexes(TASK_INDEXES);
  },

  async down({ db }) {
    if (await collectionExists(db, "tasks")) await db.dropCollection("tasks");
    if (await collectionExists(db, "legacy_tasks")) {
      await db.renameCollection("legacy_tasks", "tasks");
      await db.collection("tasks").createIndex({ workflow_template_id: 1, status: 1 }, { name: "task_workflow_template_status" });
    }
  },
};

export default migration;
