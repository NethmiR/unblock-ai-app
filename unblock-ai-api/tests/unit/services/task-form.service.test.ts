import test from "node:test";
import assert from "node:assert/strict";
import { FormFieldIssueCode, TaskFormStatus } from "../../../src/data/constants/task-form.constant.js";
import { TaskErrorCode } from "../../../src/data/constants/task-error.constant.js";
import { TaskCreationSource, TaskStepStatus } from "../../../src/data/constants/task.constant.js";
import { BaseError } from "../../../src/errors/base.error.js";
import { withErrorCode } from "../../helpers/error-assertion.helper.js";
import { IT_LEAVE_ID } from "../../helpers/selection-testbed.helper.js";
import { createTaskTestbed, ENTRY_FORM_ID, leaveEntryValues, type TaskTestbed } from "../../helpers/task-testbed.helper.js";
import type { FormFieldIssue } from "../../../src/lib/types/task/task-form.type.js";

async function createdTask(bed: TaskTestbed): Promise<string> {
  const task = await bed.taskService.create(bed.world.userIdOf("Kavindu Jayawardena"), {
    source: TaskCreationSource.CATALOGUE,
    workflowTemplateId: IT_LEAVE_ID,
  });
  return String(task._id);
}

function issuesOf(err: unknown): FormFieldIssue[] {
  assert.ok(err instanceof BaseError);
  return (err.details as { issues: FormFieldIssue[] }).issues;
}

test("a partial draft is saved without required checks", async () => {
  const bed = await createTaskTestbed();
  const taskId = await createdTask(bed);

  const saved = await bed.taskFormService.saveDraft(taskId, ENTRY_FORM_ID, { "inputs.destination_country": "Japan" });

  assert.equal(saved.values["inputs.destination_country"], "Japan");
  assert.ok(saved.forms[0]!.saved_at);
  assert.equal(saved.revision, 1);
});

test("an invalid draft value returns its issues and writes nothing", async () => {
  const bed = await createTaskTestbed();
  const taskId = await createdTask(bed);

  const err = await bed.taskFormService.saveDraft(taskId, ENTRY_FORM_ID, { "inputs.departure_date": "soon", "requester.email": "x@y.z" }).catch((error: unknown) => error);

  assert.ok(withErrorCode(TaskErrorCode.TASK_FORM_INVALID)(err));
  assert.deepEqual(issuesOf(err).map((issue) => issue.code).sort(), [FormFieldIssueCode.INVALID_DATE, FormFieldIssueCode.LOCKED].sort());
  assert.equal((await bed.taskService.get(taskId)).revision, 0);
});

test("a draft may be saved on a form whose step has not started, but not submitted", async () => {
  const bed = await createTaskTestbed();
  const taskId = await createdTask(bed);
  await bed.taskFormService.submit(taskId, ENTRY_FORM_ID, leaveEntryValues());
  const task = await bed.taskService.get(taskId);
  const withLaterForm = { ...task, forms: [...task.forms, { ...task.forms[0]!, id: "later__form", step_id: "hod_review", status: TaskFormStatus.DRAFT }] };
  bed.taskModel.tasks.set(taskId, withLaterForm);

  await bed.taskFormService.saveDraft(taskId, "later__form", {});
  await assert.rejects(bed.taskFormService.submit(taskId, "later__form", {}), withErrorCode(TaskErrorCode.TASK_FORM_NOT_AWAITING_INPUT));
});

test("submitting validates required fields and then dispatches the first approval", async () => {
  const bed = await createTaskTestbed();
  const taskId = await createdTask(bed);

  const missing = await bed.taskFormService.submit(taskId, ENTRY_FORM_ID, {}).catch((error: unknown) => error);
  assert.ok(issuesOf(missing).some((issue) => issue.code === FormFieldIssueCode.REQUIRED && issue.field_id === "assignees.advisor_review"));

  const submitted = await bed.taskFormService.submit(taskId, ENTRY_FORM_ID, leaveEntryValues());
  const advisor = submitted.steps.find((step) => step.id === "advisor_review")!;
  assert.equal(advisor.status, TaskStepStatus.AWAITING_APPROVER);
  assert.equal(advisor.assignee?.email, "advisor@u.c");
  assert.match(advisor.approval?.token_hash ?? "", /^[0-9a-f]{64}$/);
  assert.equal(submitted.forms[0]!.status, TaskFormStatus.SUBMITTED);

  await assert.rejects(bed.taskFormService.saveDraft(taskId, ENTRY_FORM_ID, {}), withErrorCode(TaskErrorCode.TASK_FORM_ALREADY_SUBMITTED));
});

test("unknown forms and finished tasks are refused", async () => {
  const bed = await createTaskTestbed();
  const taskId = await createdTask(bed);

  await assert.rejects(bed.taskFormService.saveDraft(taskId, "nope", {}), withErrorCode(TaskErrorCode.TASK_FORM_NOT_FOUND));
  await bed.taskService.cancel(taskId);
  await assert.rejects(bed.taskFormService.saveDraft(taskId, ENTRY_FORM_ID, {}), withErrorCode(TaskErrorCode.TASK_NOT_ACTIVE));
});

test("a stale revision loses the race", async () => {
  const bed = await createTaskTestbed();
  const taskId = await createdTask(bed);
  const stale = await bed.taskService.get(taskId);
  await bed.taskFormService.saveDraft(taskId, ENTRY_FORM_ID, { "inputs.destination_city": "Tokyo" });

  await assert.rejects(bed.transitions.save(stale, stale.revision), withErrorCode(TaskErrorCode.TASK_REVISION_CONFLICT));
});
