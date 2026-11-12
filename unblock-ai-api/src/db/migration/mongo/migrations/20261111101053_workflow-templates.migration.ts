import type { IndexDescription } from "mongodb";
import type { MongoMigration } from "../../../../lib/types/migration/index.type.js";

const WORKFLOW_TEMPLATE_INDEXES: IndexDescription[] = [
  { key: { archived_at: 1, updated_at: -1 }, name: "workflow_template_archived_updated" },
  { key: { status: 1, archived_at: 1, "retrieval.institution_type": 1 }, name: "workflow_template_retrieval_filter" },
];

const WORKFLOW_TEMPLATE_VERSION_INDEXES: IndexDescription[] = [
  { key: { workflow_template_id: 1, version: -1 }, name: "workflow_template_version_unique", unique: true },
];

const LEGACY_TEMPLATE_INDEXES: IndexDescription[] = [
  { key: { workflow_id: 1, version: 1 }, name: "template_id_version_unique", unique: true },
  { key: { workflow_id: 1, is_latest: 1 }, name: "template_latest" },
  { key: { is_latest: 1, review_status: 1, institution_type: 1 }, name: "template_retrieval_filter" },
];

const LEGACY_DRAFT_INDEXES: IndexDescription[] = [
  { key: { text_sha256: 1 }, name: "draft_text_sha256_unique", unique: true },
  { key: { created_at: -1 }, name: "draft_created_desc" },
];

const migration: MongoMigration = {
  async up({ db }) {
    await db.dropCollection("templates");
    await db.dropCollection("drafts");
    await db.createCollection("workflow_templates");
    await db.collection("workflow_templates").createIndexes(WORKFLOW_TEMPLATE_INDEXES);
    await db.createCollection("workflow_template_versions");
    await db.collection("workflow_template_versions").createIndexes(WORKFLOW_TEMPLATE_VERSION_INDEXES);
    await db.collection("tasks").dropIndex("task_workflow_status");
    await db
      .collection("tasks")
      .createIndex({ workflow_template_id: 1, status: 1 }, { name: "task_workflow_template_status" });
  },

  async down({ db }) {
    await db.collection("tasks").dropIndex("task_workflow_template_status");
    await db.collection("tasks").createIndex({ workflow_id: 1, status: 1 }, { name: "task_workflow_status" });
    await db.dropCollection("workflow_template_versions");
    await db.dropCollection("workflow_templates");
    await db.createCollection("drafts");
    await db.collection("drafts").createIndexes(LEGACY_DRAFT_INDEXES);
    await db.createCollection("templates");
    await db.collection("templates").createIndexes(LEGACY_TEMPLATE_INDEXES);
  },
};

export default migration;
