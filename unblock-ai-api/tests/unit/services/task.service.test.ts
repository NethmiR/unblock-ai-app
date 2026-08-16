import test from "node:test";
import assert from "node:assert/strict";
import type { ObjectId } from "mongodb";
import { TaskService } from "../../../src/services/task.service.js";
import { PlannerService } from "../../../src/services/planner.service.js";
import { ConflictError } from "../../../src/errors/conflict.error.js";
import { ValidationError } from "../../../src/errors/validation.error.js";
import { FakeTaskModel } from "../../helpers/fake-model.helper.js";
import { loadExpectedFixture } from "../../helpers/fixture.helper.js";
import type { SelectionService } from "../../../src/services/selection.service.js";
import type { WorkflowService } from "../../../src/services/workflow.service.js";
import type { WorkflowDefinition } from "../../../src/lib/types/workflow/workflow.type.js";
import type { TemplateDocument } from "../../../src/lib/types/template/template.type.js";

function fakeSelectionService(workflow: WorkflowDefinition | null): SelectionService {
  return {
    getMatchedWorkflow() {
      if (!workflow) throw new ConflictError("This session has not matched a workflow yet");
      return Promise.resolve(workflow);
    },
  } as unknown as SelectionService;
}

function fakeWorkflowService(workflow: WorkflowDefinition): WorkflowService {
  return {
    getRecord() {
      return Promise.resolve({
        workflow_id: workflow.workflow_id,
        version: 1,
      } as unknown as TemplateDocument);
    },
  } as unknown as WorkflowService;
}

function build({
  taskModel,
  workflow,
  matched = true,
}: {
  taskModel: FakeTaskModel;
  workflow: WorkflowDefinition;
  matched?: boolean;
}): TaskService {
  return new TaskService({
    taskModel: taskModel as unknown as ConstructorParameters<typeof TaskService>[0]["taskModel"],
    selectionService: fakeSelectionService(matched ? workflow : null),
    workflowService: fakeWorkflowService(workflow),
    plannerService: new PlannerService(),
  });
}

const LEAVE_WORKFLOW = loadExpectedFixture("it_faculty_overseas_leave.json");

test("create() from an unmatched session throws ConflictError", async () => {
  const taskModel = new FakeTaskModel();
  const service = build({ taskModel, workflow: LEAVE_WORKFLOW, matched: false });

  await assert.rejects(() => service.create("session-1"), ConflictError);
});

test("setValue() on a finalized task throws ConflictError", async () => {
  const taskModel = new FakeTaskModel();
  const service = build({ taskModel, workflow: LEAVE_WORKFLOW });

  const task = await service.create("session-1");
  await taskModel.setStatus(task._id, "ready");

  await assert.rejects(
    () => service.setValue(task._id, "full_name", "Jane Doe"),
    ConflictError,
  );
});

test("setValue() with an unknown key throws ValidationError", async () => {
  const taskModel = new FakeTaskModel();
  const service = build({ taskModel, workflow: LEAVE_WORKFLOW });

  const task = await service.create("session-1");

  await assert.rejects(
    () => service.setValue(task._id, "not_a_real_key", "value"),
    ValidationError,
  );
});

test("finalize() with a missing required requirement throws ValidationError naming the key", async () => {
  const taskModel = new FakeTaskModel();
  const service = build({ taskModel, workflow: LEAVE_WORKFLOW });

  const task = await service.create("session-1");

  await assert.rejects(() => service.finalize(task._id), (err: unknown) => {
    assert.ok(err instanceof ValidationError);
    assert.match(err.message, /full_name/);
    return true;
  });
});

async function fillAllRequirements(service: TaskService, taskId: ObjectId): Promise<void> {
  const values: Record<string, unknown> = {
    full_name: "Jane Doe",
    student_index_number: "IT/2020/123",
    destination_country: "Japan",
    destination_city: "Tokyo",
    departure_date: "2027-01-01",
    return_date: "2027-01-10",
    travel_reason: "Conference attendance",
    "actor:advisor_review": { name: "Dr. Advisor", email: "advisor@example.com" },
    "actor:hod_review": { name: "Prof. Hod", email: "hod@example.com" },
    "actor:dean_review": { name: "Dean Dean", email: "dean@example.com" },
  };
  for (const [key, value] of Object.entries(values)) {
    await service.setValue(taskId, key, value);
  }
}

test("finalize() on the leave fixture: advisor_review is READY, the other two are BLOCKED", async () => {
  const taskModel = new FakeTaskModel();
  const service = build({ taskModel, workflow: LEAVE_WORKFLOW });

  const task = await service.create("session-1");
  await fillAllRequirements(service, task._id);

  const finalized = await service.finalize(task._id);

  assert.equal(finalized.status, "ready");
  assert.equal(finalized.steps.length, 3);

  const byId = new Map(finalized.steps.map((s) => [s.step_id, s]));
  assert.equal(byId.get("advisor_review")?.state, "ready");
  assert.equal(byId.get("hod_review")?.state, "blocked");
  assert.equal(byId.get("dean_review")?.state, "blocked");
});

test("finalize() attaches the collected advisor to advisor_review.assignee", async () => {
  const taskModel = new FakeTaskModel();
  const service = build({ taskModel, workflow: LEAVE_WORKFLOW });

  const task = await service.create("session-1");
  await fillAllRequirements(service, task._id);

  const finalized = await service.finalize(task._id);
  const advisorStep = finalized.steps.find((s) => s.step_id === "advisor_review");

  assert.deepEqual(advisorStep?.assignee, { name: "Dr. Advisor", email: "advisor@example.com" });
});
