import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryTemplateDeletionRepository } from "../../../src/repositories/template-deletion-repository/in-memory.template-deletion-repository.js";
import type { TemplateDeletionInput } from "../../../src/lib/types/template-deletion/template-deletion.type.js";

function input(workflowId: string): TemplateDeletionInput {
  return {
    workflowId,
    templateTitle: `Template ${workflowId}`,
    latestVersion: 2,
    institutionType: null,
    reviewStatus: null,
    deletedByUserId: "00000000-0000-4000-8000-000000000001",
    deletedByEmail: "manager@example.com",
    reason: null,
    requestId: null,
    snapshot: { title: workflowId },
  };
}

test("record starts with zero versions removed and maps the deleting user", async () => {
  const repository = new InMemoryTemplateDeletionRepository();
  const record = await repository.record(input("wf-1"));

  assert.equal(record.versions_removed, 0);
  assert.equal(record.deleted_by_user_id, "00000000-0000-4000-8000-000000000001");
  assert.equal(record.deleted_by_email, "manager@example.com");
});

test("markCompleted sets versions removed", async () => {
  const repository = new InMemoryTemplateDeletionRepository();
  const record = await repository.record(input("wf-1"));
  await repository.markCompleted(record.id, 3);

  assert.equal((await repository.list(10))[0]?.versions_removed, 3);
});

test("list filters by workflow and honours the limit", async () => {
  const repository = new InMemoryTemplateDeletionRepository();
  await repository.record(input("wf-1"));
  await repository.record(input("wf-2"));
  await repository.record(input("wf-1"));

  assert.equal((await repository.list(10, "wf-1")).length, 2);
  assert.equal((await repository.list(1)).length, 1);
});
