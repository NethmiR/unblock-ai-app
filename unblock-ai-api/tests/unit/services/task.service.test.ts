import test from "node:test";
import assert from "node:assert/strict";
import { AssigneeSource } from "../../../src/data/constants/assignee.constant.js";
import { SelectionErrorCode } from "../../../src/data/constants/selection-error.constant.js";
import { FormSectionKind } from "../../../src/data/constants/task-form.constant.js";
import { TaskErrorCode } from "../../../src/data/constants/task-error.constant.js";
import { WorkflowTemplateErrorCode } from "../../../src/data/constants/workflow-template-error.constant.js";
import { ENTRY_FORM_STEP_ID, TaskCreationSource, TaskStatus, TaskStepStatus } from "../../../src/data/constants/task.constant.js";
import { SelectionMessageRole } from "../../../src/data/constants/selection.constant.js";
import { withErrorCode } from "../../helpers/error-assertion.helper.js";
import { ENG_LEAVE_ID, IT_LEAVE_ID, WORKSHOP_ID } from "../../helpers/selection-testbed.helper.js";
import { createTaskTestbed, ENTRY_FORM_ID, leaveEntryValues } from "../../helpers/task-testbed.helper.js";

const KAVINDU = "Kavindu Jayawardena";

test("creating from a matched session compiles the plan, starts the entry form and deletes the session", async () => {
  const bed = await createTaskTestbed();
  const userId = bed.world.userIdOf(KAVINDU);
  const sessionId = await bed.matchedSession(userId);

  const task = await bed.taskService.create(userId, { source: TaskCreationSource.SELECTION_SESSION, selectionSessionId: sessionId });

  assert.equal(task.status, TaskStatus.IN_PROGRESS);
  assert.equal(task.creation_source, TaskCreationSource.SELECTION_SESSION);
  assert.match(task.reference, /^TASK-\d{4}-00001$/);
  assert.equal(task.revision, 0);
  assert.equal(task.steps.find((step) => step.id === ENTRY_FORM_STEP_ID)?.status, TaskStepStatus.AWAITING_REQUESTER);
  assert.equal(task.steps.find((step) => step.id === "hod_review")?.assignee?.full_name, "Dinesh Wijesinghe");
  assert.equal(task.steps.find((step) => step.id === "dean_review")?.assignee?.full_name, "Sunethra Ratnayake");
  assert.equal(task.steps.find((step) => step.id === "advisor_review")?.assignee?.source, AssigneeSource.REQUESTER_SUPPLIED);
  assert.deepEqual(task.requester.units.map((unit) => unit.code), ["FIT", "IT"]);
  assert.deepEqual(task.conversation.filter((message) => message.role === SelectionMessageRole.REQUESTER).map((message) => message.text), [
    "I want overseas leave",
  ]);
  const details = task.forms[0]!.sections.find((section) => section.kind === FormSectionKind.REQUESTER_DETAILS)!.fields;
  assert.ok(details.every((field) => field.locked));
  await assert.rejects(bed.selection.service.get(sessionId, userId), withErrorCode(SelectionErrorCode.SELECTION_SESSION_NOT_FOUND));
});

test("creating from the catalogue requires an eligible template", async () => {
  const bed = await createTaskTestbed();
  const userId = bed.world.userIdOf(KAVINDU);

  const task = await bed.taskService.create(userId, { source: TaskCreationSource.CATALOGUE, workflowTemplateId: IT_LEAVE_ID });
  assert.equal(task.creation_source, TaskCreationSource.CATALOGUE);
  assert.deepEqual(task.conversation, []);

  await assert.rejects(
    bed.taskService.create(userId, { source: TaskCreationSource.CATALOGUE, workflowTemplateId: ENG_LEAVE_ID }),
    withErrorCode(WorkflowTemplateErrorCode.WORKFLOW_TEMPLATE_NOT_ELIGIBLE),
  );
});

test("an unmatched session cannot start a task", async () => {
  const bed = await createTaskTestbed();
  const userId = bed.world.userIdOf(KAVINDU);
  bed.selection.selector.enqueue({
    decision: "no_match" as never,
    workflow_template_id: null,
    confidence: "high",
    question: null,
    options: [],
    matched_fact_ids: [],
    reasoning: "",
  });
  const view = await bed.selection.service.start(userId, "weather");

  await assert.rejects(
    bed.taskService.create(userId, { source: TaskCreationSource.SELECTION_SESSION, selectionSessionId: String(view.session._id) }),
    withErrorCode(SelectionErrorCode.SELECTION_SESSION_NOT_MATCHED),
  );
});

test("cancel ends the task and clears any live approval link", async () => {
  const bed = await createTaskTestbed();
  const userId = bed.world.userIdOf(KAVINDU);
  const created = await bed.taskService.create(userId, { source: TaskCreationSource.CATALOGUE, workflowTemplateId: IT_LEAVE_ID });
  const submitted = await bed.taskFormService.submit(String(created._id), ENTRY_FORM_ID, leaveEntryValues());
  assert.ok(submitted.steps.find((step) => step.id === "advisor_review")?.approval?.token_hash);

  const cancelled = await bed.taskService.cancel(String(created._id));

  assert.equal(cancelled.status, TaskStatus.CANCELLED);
  assert.equal(cancelled.steps.find((step) => step.id === "advisor_review")?.approval?.token_hash, null);
  await assert.rejects(bed.taskService.cancel(String(created._id)), withErrorCode(TaskErrorCode.TASK_NOT_ACTIVE));
});

test("delete refuses a task with a dispatched approval and records the deletion otherwise", async () => {
  const bed = await createTaskTestbed();
  const userId = bed.world.userIdOf(KAVINDU);
  const fresh = await bed.taskService.create(userId, { source: TaskCreationSource.CATALOGUE, workflowTemplateId: IT_LEAVE_ID });
  const dispatched = await bed.taskService.create(userId, { source: TaskCreationSource.CATALOGUE, workflowTemplateId: IT_LEAVE_ID });
  await bed.taskFormService.submit(String(dispatched._id), ENTRY_FORM_ID, leaveEntryValues());
  const actor = { id: userId, email: "u17@u.c" };

  await assert.rejects(bed.taskService.delete(String(dispatched._id), actor), withErrorCode(TaskErrorCode.TASK_NOT_DELETABLE));
  await bed.taskService.delete(String(fresh._id), actor);
  await bed.taskService.cancel(String(dispatched._id));
  await bed.taskService.delete(String(dispatched._id), actor);

  assert.equal(bed.taskModel.tasks.size, 0);
  assert.equal(bed.auditRecords.length, 2);
});

test("list returns only the caller's tasks, filtered and paged", async () => {
  const bed = await createTaskTestbed();
  const userId = bed.world.userIdOf(KAVINDU);
  const other = bed.world.userIdOf("Ishara Bandara");
  for (let index = 0; index < 3; index++) {
    await bed.taskService.create(userId, { source: TaskCreationSource.CATALOGUE, workflowTemplateId: IT_LEAVE_ID });
  }
  const cancelled = await bed.taskService.create(userId, { source: TaskCreationSource.CATALOGUE, workflowTemplateId: IT_LEAVE_ID });
  await bed.taskService.cancel(String(cancelled._id));
  await bed.taskService.create(other, { source: TaskCreationSource.CATALOGUE, workflowTemplateId: WORKSHOP_ID });

  const page = await bed.taskService.list(userId, { status: TaskStatus.IN_PROGRESS, search: null, limit: 2, offset: 0 });
  const search = await bed.taskService.list(userId, { status: null, search: "00004", limit: 20, offset: 0 });

  assert.equal(page.total, 3);
  assert.equal(page.tasks.length, 2);
  assert.ok(page.tasks.every((task) => task.created_by === userId));
  assert.deepEqual(search.tasks.map((task) => task.reference.slice(-5)), ["00004"]);
});

test("isOwnedBy compares the creator", async () => {
  const bed = await createTaskTestbed();
  const userId = bed.world.userIdOf(KAVINDU);
  const task = await bed.taskService.create(userId, { source: TaskCreationSource.CATALOGUE, workflowTemplateId: IT_LEAVE_ID });

  assert.equal(await bed.taskService.isOwnedBy(String(task._id), userId), true);
  assert.equal(await bed.taskService.isOwnedBy(String(task._id), "someone-else"), false);
});
