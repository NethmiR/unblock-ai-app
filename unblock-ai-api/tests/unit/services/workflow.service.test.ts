import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { startInMemoryMongo, stopInMemoryMongo } from "../../helpers/in-memory-mongo.helper.js";
import { loadExpectedFixture } from "../../helpers/fixture.helper.js";

await startInMemoryMongo();

const { WorkflowService } = await import("../../../src/services/workflow.service.js");
const { TemplateModel } = await import("../../../src/models/template.model.js");
const { ValidationService } = await import("../../../src/services/validation.service.js");
const { TaskModel } = await import("../../../src/models/task.model.js");
const { AuditService } = await import("../../../src/services/audit.service.js");
const { AuditLogModel } = await import("../../../src/models/audit-log.model.js");
const { getDb, closeDb } = await import("../../../src/db/mongo.client.js");
const { REVIEW_STATUS } = await import("../../../src/data/constants/status.constant.js");
const { ConflictError } = await import("../../../src/errors/conflict.error.js");
const { NotFoundError } = await import("../../../src/errors/not-found.error.js");

/** No login yet, so an unauthenticated delete still has to be representable. */
const ANONYMOUS_ACTOR = { id: null, email: null, role: null };

const fixture = loadExpectedFixture("it_faculty_overseas_leave.json");

function fakeEmbeddingService(): InstanceType<typeof import("../../../src/services/embedding.service.js").EmbeddingService> {
  const dim = 8;
  return {
    embedDocument: (text: string) => {
      const vector = new Array(dim).fill(0);
      vector[text.length % dim] = 1;
      return Promise.resolve(vector);
    },
    embedQuery: (text: string) => {
      const vector = new Array(dim).fill(0);
      vector[text.length % dim] = 1;
      return Promise.resolve(vector);
    },
    metadata: () => ({ model: "fake-embedder", dim, embedded_at: new Date().toISOString() }),
  } as unknown as InstanceType<typeof import("../../../src/services/embedding.service.js").EmbeddingService>;
}

function newService(): InstanceType<typeof WorkflowService> {
  return new WorkflowService({
    templateModel: new TemplateModel(),
    embeddingService: fakeEmbeddingService(),
    validationService: new ValidationService(),
    taskModel: new TaskModel(),
    auditService: new AuditService({ auditLogModel: new AuditLogModel() }),
  });
}

before(async () => {
  await getDb();
});

after(async () => {
  const db = await getDb();
  await db.dropDatabase();
  await closeDb();
  await stopInMemoryMongo();
});

beforeEach(async () => {
  const db = await getDb();
  await db.collection("templates").deleteMany({});
  await db.collection("tasks").deleteMany({});
  await db.collection("audit_logs").deleteMany({});
});

/** Only the fields `delete` reads - it counts by workflow_id and status. */
async function seedTask(workflowId: string, status: string): Promise<void> {
  const db = await getDb();
  await db.collection("tasks").insertOne({ workflow_id: workflowId, status, created_at: new Date() });
}

test("save creates version 1", async () => {
  const service = newService();
  const result = await service.save(fixture);
  assert.equal(result.version, 1);

  const loaded = await service.getDocument(fixture.workflow_id);
  assert.equal(loaded.workflow_id, fixture.workflow_id);
});

test("save again bumps to v2 and demotes the previous is_latest", async () => {
  const service = newService();
  await service.save(fixture);
  const second = await service.save({ ...fixture, title: "Updated title" });
  assert.equal(second.version, 2);

  const v1Record = await service.getRecord(fixture.workflow_id, 1);
  const v2Record = await service.getRecord(fixture.workflow_id, 2);
  assert.equal(v1Record.is_latest, false);
  assert.equal(v2Record.is_latest, true);
});

test("getDocument defaults to latest", async () => {
  const service = newService();
  await service.save(fixture);
  await service.save({ ...fixture, title: "Updated title" });

  const latest = await service.getDocument(fixture.workflow_id);
  assert.equal(latest.title, "Updated title");
});

test("getDocument(id, version) returns that specific version", async () => {
  const service = newService();
  await service.save(fixture);
  await service.save({ ...fixture, title: "Updated title" });

  const v1 = await service.getDocument(fixture.workflow_id, 1);
  assert.equal(v1.title, fixture.title);
});

test("list filters by institution_type", async () => {
  const service = newService();
  await service.save(fixture);

  const matching = await service.list({ institution_type: fixture.scope.institution_type });
  assert.equal(matching.length, 1);

  const nonMatching = await service.list({ institution_type: "does_not_exist" });
  assert.equal(nonMatching.length, 0);
});

test("search is case-insensitive over title and description", async () => {
  const service = newService();
  await service.save(fixture);

  const results = await service.search(fixture.title.toUpperCase());
  assert.equal(results.length, 1);
  assert.equal(results[0]?.workflow_id, fixture.workflow_id);
});

test("setReviewStatus flips both the row and document.metadata.review_status", async () => {
  const service = newService();
  const { version } = await service.save(fixture);

  const updated = await service.setReviewStatus(fixture.workflow_id, version, REVIEW_STATUS.CONFIRMED);
  assert.equal(updated?.review_status, REVIEW_STATUS.CONFIRMED);

  const record = await service.getRecord(fixture.workflow_id);
  assert.equal(record.document.metadata.review_status, REVIEW_STATUS.CONFIRMED);
});

test("listForRetrieval-backed search excludes templates pending admin review", async () => {
  const service = newService();
  const templateModel = new TemplateModel();
  const { version } = await service.save(fixture);

  const beforePublish = await templateModel.listForRetrieval({});
  assert.equal(beforePublish.length, 0);

  await service.setReviewStatus(fixture.workflow_id, version, REVIEW_STATUS.CONFIRMED);

  const afterPublish = await templateModel.listForRetrieval({});
  assert.equal(afterPublish.length, 1);
  assert.equal(afterPublish[0]?.workflow_id, fixture.workflow_id);
});

test("delete removes every version, not just the latest", async () => {
  const service = newService();
  await service.save(fixture);
  await service.save({ ...fixture, title: "Updated title" });

  await service.delete(fixture.workflow_id, ANONYMOUS_ACTOR);

  const db = await getDb();
  const remaining = await db.collection("templates").countDocuments({ workflow_id: fixture.workflow_id });
  assert.equal(remaining, 0);
});

test("delete records who did it, with the title the row no longer carries", async () => {
  const service = newService();
  await service.save(fixture);

  await service.delete(fixture.workflow_id, { id: "a-1", email: "admin@uni.edu", role: "admin" }, "req-4");

  const db = await getDb();
  const entries = await db.collection("audit_logs").find({ resource: "template" }).toArray();
  assert.equal(entries.length, 1);
  const entry = entries[0]!;
  assert.equal(entry.resource_id, fixture.workflow_id);
  assert.equal(entry.action, "deleted");
  assert.equal(entry.actor.email, "admin@uni.edu");
  assert.equal(entry.request_id, "req-4");
  assert.equal(entry.snapshot.title, fixture.title);
});

test("delete is refused while a task is still in progress on the workflow", async () => {
  const service = newService();
  await service.save(fixture);
  await seedTask(fixture.workflow_id, "in_progress");

  await assert.rejects(
    () => service.delete(fixture.workflow_id, ANONYMOUS_ACTOR),
    (err: unknown) => {
      assert.ok(err instanceof ConflictError);
      assert.match(err.message, /still in progress/);
      return true;
    },
  );

  // Refused means untouched - both the template and the audit log.
  const db = await getDb();
  assert.equal(await db.collection("templates").countDocuments({ workflow_id: fixture.workflow_id }), 1);
  assert.equal(await db.collection("audit_logs").countDocuments({}), 0);
});

test("finished tasks do not block a delete", async () => {
  const service = newService();
  await service.save(fixture);
  await seedTask(fixture.workflow_id, "completed");
  await seedTask(fixture.workflow_id, "cancelled");

  await service.delete(fixture.workflow_id, ANONYMOUS_ACTOR);

  const db = await getDb();
  assert.equal(await db.collection("templates").countDocuments({ workflow_id: fixture.workflow_id }), 0);
});

test("delete of an unknown workflow throws NotFoundError", async () => {
  const service = newService();
  await assert.rejects(() => service.delete("does_not_exist", ANONYMOUS_ACTOR), NotFoundError);
});
