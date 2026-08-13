import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { startInMemoryMongo, stopInMemoryMongo } from "../../helpers/in-memory-mongo.helper.js";

await startInMemoryMongo();

const { DraftService } = await import("../../../src/services/draft.service.js");
const { DraftModel } = await import("../../../src/models/draft.model.js");
const { getDb, closeDb } = await import("../../../src/db/mongo.client.js");

function newService(): InstanceType<typeof DraftService> {
  return new DraftService({ draftModel: new DraftModel() });
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
  await db.collection("drafts").deleteMany({});
});

test("create returns the same draft when the same text is submitted twice", async () => {
  const service = newService();
  const first = await service.create({ rawText: "Staff must obtain approval before travelling abroad." });
  const second = await service.create({ rawText: "Staff must obtain approval before travelling abroad." });

  assert.equal(String(first._id), String(second._id));
});

test("create treats CRLF-normalised duplicate text as idempotent", async () => {
  const service = newService();
  const first = await service.create({ rawText: "line one\nline two" });
  const second = await service.create({ rawText: "line one\r\nline two" });

  assert.equal(String(first._id), String(second._id));
});

test("create starts a draft in the pending status", async () => {
  const service = newService();
  const draft = await service.create({ rawText: "Some workflow text." });
  assert.equal(draft.status, "pending");
});

test("markExtracted transitions status to extracted and records the workflow id", async () => {
  const service = newService();
  const draft = await service.create({ rawText: "Some workflow text." });

  const updated = await service.markExtracted(draft._id, "wf_1");
  assert.equal(updated?.status, "extracted");
  assert.equal(updated?.workflow_id, "wf_1");
});

test("markFailed transitions status to failed and records the failure reason", async () => {
  const service = newService();
  const draft = await service.create({ rawText: "Some workflow text." });

  const updated = await service.markFailed(draft._id, "model call failed");
  assert.equal(updated?.status, "failed");
  assert.equal(updated?.failure_reason, "model call failed");
});

test("markRejected transitions status to rejected and records the failure reason", async () => {
  const service = newService();
  const draft = await service.create({ rawText: "Some workflow text." });

  const updated = await service.markRejected(draft._id, "does not describe a workflow");
  assert.equal(updated?.status, "rejected");
  assert.equal(updated?.failure_reason, "does not describe a workflow");
});

test("markFailed truncates the failure reason to 2000 characters", async () => {
  const service = newService();
  const draft = await service.create({ rawText: "Some workflow text." });

  const longReason = "x".repeat(3000);
  const updated = await service.markFailed(draft._id, longReason);
  assert.equal(updated?.failure_reason?.length, 2000);
});

test("getById throws NotFoundError for an unknown draft", async () => {
  const service = newService();
  await assert.rejects(() => service.getById("64b64b64b64b64b64b64b64"));
});

test("list returns drafts newest first", async () => {
  const service = newService();
  const first = await service.create({ rawText: "first draft text" });
  await new Promise((resolve) => setTimeout(resolve, 5));
  const second = await service.create({ rawText: "second draft text" });

  const list = await service.list();
  assert.equal(String(list[0]?._id), String(second._id));
  assert.equal(String(list[1]?._id), String(first._id));
});
