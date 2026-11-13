import type { IndexDescription } from "mongodb";
import type { MongoMigration } from "../../../../lib/types/migration/index.type.js";

const ASSIGNEE_INDEXES: IndexDescription[] = [
  { key: { "steps.assignee.user_id": 1, "steps.status": 1 }, name: "task_step_assignee_user_status" },
  { key: { "steps.assignee.email": 1, "steps.status": 1 }, name: "task_step_assignee_email_status" },
];

const NORMALISED_ASSIGNEE_EMAILS = [
  {
    $set: {
      steps: {
        $map: {
          input: "$steps",
          as: "s",
          in: {
            $cond: [
              { $eq: [{ $type: "$$s.assignee.email" }, "string"] },
              {
                $mergeObjects: [
                  "$$s",
                  { assignee: { $mergeObjects: ["$$s.assignee", { email: { $trim: { input: { $toLower: "$$s.assignee.email" } } } }] } },
                ],
              },
              "$$s",
            ],
          },
        },
      },
    },
  },
];

const migration: MongoMigration = {
  async up({ db }) {
    const tasks = db.collection("tasks");
    await tasks.updateMany({ "steps.assignee.email": { $type: "string" } }, NORMALISED_ASSIGNEE_EMAILS);
    await tasks.updateMany(
      { "steps.approval": { $type: "object" } },
      { $set: { "steps.$[s].approval.decided_via": null, "steps.$[s].approval.decided_by_user_id": null } },
      { arrayFilters: [{ "s.approval": { $type: "object" }, "s.approval.decided_via": { $exists: false } }] },
    );
    await tasks.createIndexes(ASSIGNEE_INDEXES);
  },

  async down({ db }) {
    const tasks = db.collection("tasks");
    for (const index of ASSIGNEE_INDEXES) {
      if (index.name !== undefined && (await tasks.indexExists(index.name))) await tasks.dropIndex(index.name);
    }
    await tasks.updateMany(
      { "steps.approval": { $type: "object" } },
      { $unset: { "steps.$[s].approval.decided_via": "", "steps.$[s].approval.decided_by_user_id": "" } },
      { arrayFilters: [{ "s.approval": { $type: "object" } }] },
    );
  },
};

export default migration;
