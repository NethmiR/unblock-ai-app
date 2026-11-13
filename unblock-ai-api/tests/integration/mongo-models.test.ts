import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { startInMemoryMongo, stopInMemoryMongo } from "../helpers/in-memory-mongo.helper.js";
import { TaskErrorCode } from "../../src/data/constants/task-error.constant.js";
import { SelectionSessionStatus } from "../../src/data/constants/selection.constant.js";
import { withErrorCode } from "../helpers/error-assertion.helper.js";
import { loadExpectedFixture } from "../helpers/fixture.helper.js";
import { buildTaskDocument, leaveResolutions } from "../helpers/task-fixture.helper.js";
import type { TaskModel } from "../../src/models/task.model.js";
import type { SelectionSessionModel } from "../../src/models/selection-session.model.js";
import type { MongoMigration } from "../../src/lib/types/migration/migration.type.js";

type MongoClientModule = typeof import("../../src/db/mongo.client.js");

let mongo: MongoClientModule;
let taskModel: TaskModel;
let sessionModel: SelectionSessionModel;

before(async () => {
  await startInMemoryMongo();
  mongo = await import("../../src/db/mongo.client.js");
  taskModel = new (await import("../../src/models/task.model.js")).TaskModel();
  sessionModel = new (await import("../../src/models/selection-session.model.js")).SelectionSessionModel();
});

after(async () => {
  await mongo.closeDb();
  await stopInMemoryMongo();
});

function leaveTask() {
  return buildTaskDocument(loadExpectedFixture("it_faculty_overseas_leave.json"), leaveResolutions());
}

test("a task with dotted value keys round-trips through insert and findById", async () => {
  const task = { ...leaveTask(), values: { "inputs.destination_country": "Japan", "requester.email": "u17@u.c" } };

  await taskModel.insert(task);
  const found = await taskModel.findById(String(task._id));

  assert.ok(found);
  assert.ok(found._id instanceof ObjectId);
  assert.ok(found.created_at instanceof Date);
  assert.equal(found.values["inputs.destination_country"], "Japan");
  assert.equal(found.steps.length, task.steps.length);
});

test("replaceWithRevision bumps the revision and rejects a stale one", async () => {
  const task = leaveTask();
  await taskModel.insert(task);

  const saved = await taskModel.replaceWithRevision({ ...task, values: { "inputs.destination_city": "Tokyo" } }, 0);
  assert.equal(saved.revision, 1);
  assert.equal(saved.values["inputs.destination_city"], "Tokyo");

  await assert.rejects(taskModel.replaceWithRevision(task, 0), withErrorCode(TaskErrorCode.TASK_REVISION_CONFLICT));
});

test("a task is found by its approval token hash and listed with an escaped search", async () => {
  const task = leaveTask();
  const withHash = {
    ...task,
    reference: "TASK-2026-77777",
    created_by: "searcher",
    steps: task.steps.map((step) => (step.approval ? { ...step, approval: { ...step.approval, token_hash: `hash-${String(task._id)}` } } : step)),
  };
  await taskModel.insert(withHash);

  const byHash = await taskModel.findByApprovalTokenHash(`hash-${String(task._id)}`);
  const page = await taskModel.findOwnedSummaryPage("searcher", { status: null, search: "2026-777", limit: 10, offset: 0 });
  const none = await taskModel.findOwnedSummaryPage("searcher", { status: null, search: "2026.777(", limit: 10, offset: 0 });

  assert.equal(String(byHash?._id), String(task._id));
  assert.equal(page.total, 1);
  assert.equal(none.total, 0);
  assert.equal(await taskModel.findCreatorById(String(task._id)), "searcher");
  assert.equal(await taskModel.nextSequence(new Date("2026-01-01")), 1);
  assert.equal(await taskModel.nextSequence(new Date("2026-06-01")), 2);
});

test("selection sessions are owned and expire", async () => {
  const now = new Date();
  const base = {
    created_by: "owner",
    status: SelectionSessionStatus.OPEN,
    messages: [],
    candidates: [],
    rounds_used: 0,
    selected_workflow_template_id: null,
    created_at: now,
    updated_at: now,
  };
  const live = await sessionModel.insert({ ...base, expires_at: new Date(now.getTime() + 60_000) });
  const expired = await sessionModel.insert({ ...base, expires_at: new Date(now.getTime() - 60_000) });

  assert.ok(await sessionModel.findOwned(String(live._id), "owner"));
  assert.equal(await sessionModel.findOwned(String(live._id), "stranger"), null);
  assert.equal(await sessionModel.findOwned(String(expired._id), "owner"), null);
  assert.equal(await sessionModel.findOwned("not-an-id", "owner"), null);

  await sessionModel.replace({ ...live, rounds_used: 1 });
  assert.equal((await sessionModel.findOwned(String(live._id), "owner"))?.rounds_used, 1);
  assert.equal(await sessionModel.deleteOwned(String(live._id), "stranger"), false);
  assert.equal(await sessionModel.deleteOwned(String(live._id), "owner"), true);
});

test("both migrations apply and roll back", async () => {
  const db = await mongo.getDb();
  const load = async (path: string): Promise<MongoMigration> => (await import(path)).default as MongoMigration;
  const sessions = await load("../../src/db/migration/mongo/migrations/20261113084701_ephemeral-selection-sessions.migration.js");
  const tasks = await load("../../src/db/migration/mongo/migrations/20261113090856_task-request-revamp.migration.js");

  await sessions.up({ db });
  const sessionIndexes = await db.collection("selection_sessions").indexes();
  assert.equal(sessionIndexes.find((index) => index.name === "selection_session_expiry")?.expireAfterSeconds, 0);

  await tasks.up({ db });
  const taskIndexes = (await db.collection("tasks").indexes()).map((index) => index.name);
  assert.ok(taskIndexes.includes("task_approval_token_hash"));
  assert.ok((await db.listCollections({ name: "legacy_tasks" }).toArray()).length === 1);

  await tasks.down({ db });
  assert.equal((await db.listCollections({ name: "legacy_tasks" }).toArray()).length, 0);
  await sessions.down({ db });
  assert.equal((await db.collection("selection_sessions").indexes()).some((index) => index.name === "selection_session_expiry"), false);
});
