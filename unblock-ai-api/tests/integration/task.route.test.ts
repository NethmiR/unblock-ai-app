import test from "node:test";
import assert from "node:assert/strict";
import { TaskController } from "../../src/controllers/task.controller.js";
import { TaskFormController } from "../../src/controllers/task-form.controller.js";
import { createRequireTaskOwnership } from "../../src/middlewares/require-task-ownership.middleware.js";
import { TaskService } from "../../src/services/task.service.js";
import { FormFieldIssueCode, FormSectionKind, TaskFormStatus } from "../../src/data/constants/task-form.constant.js";
import { TaskErrorCode } from "../../src/data/constants/task-error.constant.js";
import { WorkflowTemplateErrorCode } from "../../src/data/constants/workflow-template-error.constant.js";
import { TaskCreationSource, TaskStatus, TaskStepStatus } from "../../src/data/constants/task.constant.js";
import { createTestAuthentication, createTestControllers, startTestServer, TEST_USERS, TestIdentity, type TestServer } from "../helpers/test-server.helper.js";
import { HttpMethod, readJson, sendJson } from "../helpers/http-request.helper.js";
import { ENG_LEAVE_ID, IT_LEAVE_ID } from "../helpers/selection-testbed.helper.js";
import { createTaskTestbed, ENTRY_FORM_ID, leaveEntryValues, type TaskTestbed } from "../helpers/task-testbed.helper.js";
import type { ErrorResponseBody } from "../../src/lib/types/http/http.type.js";
import type { FormFieldIssueDto, TaskDto, TaskListResponseDto } from "../../src/lib/types/task/task-dto.type.js";

const KAVINDU = TestIdentity.TASK_CREATOR;
const HASITHA = TestIdentity.ADMINISTRATOR;

async function withServer(run: (server: TestServer, bed: TaskTestbed) => Promise<void>): Promise<void> {
  const bed = await createTaskTestbed({
    userNames: new Map([
      [TEST_USERS[KAVINDU].id, "Kavindu Jayawardena"],
      [TEST_USERS[HASITHA].id, "Hasitha Dissanayake"],
    ]),
  });
  const serialization = { documentsEnabled: true, isDeletable: TaskService.isDeletable };
  const server = await startTestServer(
    createTestControllers({
      taskController: new TaskController({ taskService: bed.taskService, serialization, transcriptService: { renderForTask: async () => null } }),
      taskFormController: new TaskFormController({ taskFormService: bed.taskFormService, serialization }),
    }),
    {
      authenticationService: createTestAuthentication().authenticationService,
      routeGuards: { requireTaskOwnership: createRequireTaskOwnership({ taskService: bed.taskService }) },
    },
  );
  try {
    await run(server, bed);
  } finally {
    await server.close();
  }
}

async function createFromCatalogue(server: TestServer, identity: TestIdentity = KAVINDU, workflowTemplateId = IT_LEAVE_ID): Promise<Response> {
  return sendJson(server.baseUrl, HttpMethod.POST, "/tasks", identity, { source: TaskCreationSource.CATALOGUE, workflow_template_id: workflowTemplateId });
}

test("POST /tasks from a matched session returns the entry form with locked details and directory approvers", async () => {
  await withServer(async (server, bed) => {
    const sessionId = await bed.matchedSession(TEST_USERS[KAVINDU].id);

    const response = await sendJson(server.baseUrl, HttpMethod.POST, "/tasks", KAVINDU, {
      source: TaskCreationSource.SELECTION_SESSION,
      selection_session_id: sessionId,
    });

    assert.equal(response.status, 201);
    const task = await readJson<TaskDto>(response);
    const entry = task.forms[0]!;
    const details = entry.sections.find((section) => section.kind === FormSectionKind.REQUESTER_DETAILS)!.fields;
    assert.deepEqual(details.slice(0, 2).map((field) => [field.id, field.locked, field.value]), [
      ["requester.full_name", true, "Kavindu Jayawardena"],
      ["requester.email", true, "u17@u.c"],
    ]);
    assert.ok(entry.sections.find((section) => section.kind === FormSectionKind.APPROVER_DETAILS)?.fields.some((field) => field.id === "assignees.advisor_review"));
    assert.equal(task.steps.find((step) => step.id === "hod_review")?.assignee?.full_name, "Dinesh Wijesinghe");
    assert.equal(task.steps.find((step) => step.id === "dean_review")?.assignee?.full_name, "Sunethra Ratnayake");
    assert.equal(entry.editable, true);
    assert.equal(entry.submittable, true);
    assert.deepEqual(task.progress, { completed: 0, total: 4, current_step_ids: ["entry_form"] });
  });
});

test("POST /tasks from the catalogue rejects an ineligible template with 403", async () => {
  await withServer(async (server) => {
    assert.equal((await createFromCatalogue(server)).status, 201);

    const response = await createFromCatalogue(server, KAVINDU, ENG_LEAVE_ID);

    assert.equal(response.status, 403);
    assert.equal((await readJson<ErrorResponseBody>(response)).code, WorkflowTemplateErrorCode.WORKFLOW_TEMPLATE_NOT_ELIGIBLE);
  });
});

test("draft saves accept partial values and report field issues", async () => {
  await withServer(async (server) => {
    const task = await readJson<TaskDto>(await createFromCatalogue(server));
    const path = `/tasks/${task.id}/forms/${ENTRY_FORM_ID}/draft`;

    const partial = await sendJson(server.baseUrl, HttpMethod.PUT, path, KAVINDU, { values: { "inputs.destination_country": "Japan" } });
    const invalid = await sendJson(server.baseUrl, HttpMethod.PUT, path, KAVINDU, { values: { "inputs.departure_date": "soon" } });

    assert.equal(partial.status, 200);
    const saved = await readJson<TaskDto>(partial);
    assert.equal(saved.forms[0]!.sections.flatMap((section) => section.fields).find((field) => field.id === "inputs.destination_country")?.value, "Japan");
    assert.equal(invalid.status, 400);
    const body = await readJson<ErrorResponseBody>(invalid);
    assert.equal(body.code, TaskErrorCode.TASK_FORM_INVALID);
    assert.deepEqual((body.details as { issues: FormFieldIssueDto[] }).issues.map((issue) => issue.code), [FormFieldIssueCode.INVALID_DATE]);
  });
});

test("a form whose step has not started accepts drafts but not submission", async () => {
  await withServer(async (server, bed) => {
    const created = await readJson<TaskDto>(await createFromCatalogue(server));
    const stored = bed.taskModel.tasks.get(created.id)!;
    bed.taskModel.tasks.set(created.id, {
      ...stored,
      forms: [...stored.forms, { ...stored.forms[0]!, id: "later__form", step_id: "hod_review", status: TaskFormStatus.DRAFT }],
    });

    const draft = await sendJson(server.baseUrl, HttpMethod.PUT, `/tasks/${created.id}/forms/later__form/draft`, KAVINDU, { values: {} });
    const submit = await sendJson(server.baseUrl, HttpMethod.POST, `/tasks/${created.id}/forms/later__form/submit`, KAVINDU, { values: {} });

    assert.equal(draft.status, 200);
    assert.equal(submit.status, 409);
    assert.equal((await readJson<ErrorResponseBody>(submit)).code, TaskErrorCode.TASK_FORM_NOT_AWAITING_INPUT);
  });
});

test("submitting the entry form dispatches the advisor with a stored hash and no token in the response", async () => {
  await withServer(async (server, bed) => {
    const created = await readJson<TaskDto>(await createFromCatalogue(server));

    const response = await sendJson(server.baseUrl, HttpMethod.POST, `/tasks/${created.id}/forms/${ENTRY_FORM_ID}/submit`, KAVINDU, { values: leaveEntryValues() });

    assert.equal(response.status, 200);
    const raw = await response.text();
    const task = JSON.parse(raw) as TaskDto;
    assert.equal(task.steps.find((step) => step.id === "advisor_review")?.status, TaskStepStatus.AWAITING_APPROVER);
    assert.ok(!raw.includes("token"));
    assert.match(bed.taskModel.tasks.get(created.id)!.steps.find((step) => step.id === "advisor_review")!.approval!.token_hash ?? "", /^[0-9a-f]{64}$/);
    assert.equal(task.forms[0]!.editable, false);
    assert.equal(task.available_actions.can_delete, false);
  });
});

test("a lost optimistic-concurrency race returns 409", async () => {
  await withServer(async (server, bed) => {
    const created = await readJson<TaskDto>(await createFromCatalogue(server));
    const findById = bed.taskModel.findById.bind(bed.taskModel);
    bed.taskModel.findById = async (id) => {
      const found = await findById(id);
      return found ? { ...found, revision: found.revision - 1 } : null;
    };

    const response = await sendJson(server.baseUrl, HttpMethod.PUT, `/tasks/${created.id}/forms/${ENTRY_FORM_ID}/draft`, KAVINDU, { values: {} });

    assert.equal(response.status, 409);
    assert.equal((await readJson<ErrorResponseBody>(response)).code, TaskErrorCode.TASK_REVISION_CONFLICT);
  });
});

test("GET /tasks lists the caller's tasks with status filters and pagination", async () => {
  await withServer(async (server) => {
    const ids: string[] = [];
    for (let index = 0; index < 3; index++) ids.push((await readJson<TaskDto>(await createFromCatalogue(server))).id);
    await sendJson(server.baseUrl, HttpMethod.POST, `/tasks/${ids[0]}/cancel`, KAVINDU);

    const page = await readJson<TaskListResponseDto>(await sendJson(server.baseUrl, HttpMethod.GET, "/tasks?status=in_progress&limit=1&offset=0", KAVINDU));
    const all = await readJson<TaskListResponseDto>(await sendJson(server.baseUrl, HttpMethod.GET, "/tasks", KAVINDU));
    const foreign = await readJson<TaskListResponseDto>(await sendJson(server.baseUrl, HttpMethod.GET, "/tasks", HASITHA));
    const badLimit = await sendJson(server.baseUrl, HttpMethod.GET, "/tasks?limit=1000", KAVINDU);

    assert.deepEqual(page.page, { total: 2, limit: 1, offset: 0 });
    assert.equal(page.tasks.length, 1);
    assert.equal(all.page.total, 3);
    assert.equal(all.tasks[0]!.status, TaskStatus.CANCELLED);
    assert.equal(all.tasks[1]!.current_steps[0]?.id, "entry_form");
    assert.equal(foreign.page.total, 0);
    assert.equal(badLimit.status, 400);
  });
});

test("cancel and delete follow the dispatch rule, and other users get 404", async () => {
  await withServer(async (server) => {
    const fresh = await readJson<TaskDto>(await createFromCatalogue(server));
    const live = await readJson<TaskDto>(await createFromCatalogue(server));
    await sendJson(server.baseUrl, HttpMethod.POST, `/tasks/${live.id}/forms/${ENTRY_FORM_ID}/submit`, KAVINDU, { values: leaveEntryValues() });

    assert.equal((await sendJson(server.baseUrl, HttpMethod.GET, `/tasks/${fresh.id}`, HASITHA)).status, 404);
    assert.equal((await sendJson(server.baseUrl, HttpMethod.DELETE, `/tasks/${live.id}`, KAVINDU)).status, 409);
    assert.equal((await sendJson(server.baseUrl, HttpMethod.DELETE, `/tasks/${fresh.id}`, KAVINDU)).status, 204);

    const cancelled = await sendJson(server.baseUrl, HttpMethod.POST, `/tasks/${live.id}/cancel`, KAVINDU);
    assert.equal((await readJson<TaskDto>(cancelled)).status, TaskStatus.CANCELLED);
    assert.equal((await sendJson(server.baseUrl, HttpMethod.POST, `/tasks/${live.id}/cancel`, KAVINDU)).status, 409);
    assert.equal((await sendJson(server.baseUrl, HttpMethod.DELETE, `/tasks/${live.id}`, KAVINDU)).status, 204);
  });
});

test("GET /tasks/:id/workflow-definition returns the pinned definition", async () => {
  await withServer(async (server) => {
    const created = await readJson<TaskDto>(await createFromCatalogue(server));

    const response = await sendJson(server.baseUrl, HttpMethod.GET, `/tasks/${created.id}/workflow-definition`, KAVINDU);

    assert.equal(response.status, 200);
    assert.equal((await readJson<{ definition: { title: string } }>(response)).definition.title, "IT Faculty Overseas Leave Approval");
  });
});
