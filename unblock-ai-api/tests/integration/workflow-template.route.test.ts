import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { WorkflowTemplateController } from "../../src/controllers/workflow-template.controller.js";
import { AuthErrorCode } from "../../src/data/constants/auth.constant.js";
import { WorkflowTemplateStatus } from "../../src/data/constants/workflow-template.constant.js";
import { WorkflowTemplateErrorCode } from "../../src/data/constants/workflow-template-error.constant.js";
import { WorkflowTemplateGenerationError } from "../../src/errors/workflow-template-generation.error.js";
import { workflowTemplatePromptRejected } from "../../src/errors/workflow-template.error.js";
import {
  TEST_USERS,
  TestIdentity,
  createTestAuthentication,
  createTestControllers,
  startTestServer,
} from "../helpers/test-server.helper.js";
import { HttpMethod, readJson, sendJson } from "../helpers/http-request.helper.js";
import {
  createWorkflowTemplateTestbed,
  generatedFromFixture,
  type WorkflowTemplateTestbed,
} from "../helpers/workflow-template.helper.js";
import type { ErrorResponseBody } from "../../src/lib/types/http/http.type.js";
import type {
  WorkflowTemplateDto,
  WorkflowTemplateSummaryDto,
  WorkflowTemplateVersionDto,
  WorkflowTemplateVersionSummaryDto,
} from "../../src/lib/types/workflow-template/workflow-template.type.js";

type TemplateResponse = { workflow_template: WorkflowTemplateDto };

const MANAGER = TestIdentity.WORKFLOW_MANAGER;
const TASK_CREATOR = TestIdentity.TASK_CREATOR;
const MANAGER_NAME = TEST_USERS[MANAGER].fullName;
const BASE = "/workflow-templates";
const PROMPT = "Students travelling overseas need advisor, HOD and dean approval.";
const REVISED_PROMPT = "Students travelling overseas need advisor and dean approval only.";
const GENERATED = generatedFromFixture();

interface Context {
  testbed: WorkflowTemplateTestbed;
  send: (method: HttpMethod, path: string, identity: TestIdentity | null, body?: unknown) => Promise<Response>;
}

async function withServer(run: (context: Context) => Promise<void>): Promise<void> {
  const authentication = createTestAuthentication();
  const testbed = createWorkflowTemplateTestbed(authentication.userRepository);
  const controllers = createTestControllers({
    workflowTemplateController: new WorkflowTemplateController({ workflowTemplateService: testbed.service }),
  });
  const server = await startTestServer(controllers, { authenticationService: authentication.authenticationService });
  const send = (method: HttpMethod, path: string, identity: TestIdentity | null, body?: unknown): Promise<Response> =>
    sendJson(server.baseUrl, method, path, identity, body);
  try {
    await run({ testbed, send });
  } finally {
    await server.close();
  }
}

async function templateFrom(response: Response, status: number): Promise<WorkflowTemplateDto> {
  assert.equal(response.status, status);
  return (await readJson<TemplateResponse>(response)).workflow_template;
}

async function expectError(response: Response, status: number, code?: string): Promise<ErrorResponseBody> {
  assert.equal(response.status, status);
  const body = await readJson<ErrorResponseBody>(response);
  if (code !== undefined) assert.equal(body.code, code);
  return body;
}

async function createDraft({ send }: Context, title = "Overseas Leave"): Promise<WorkflowTemplateDto> {
  return templateFrom(await send(HttpMethod.POST, BASE, MANAGER, { title, prompt: PROMPT }), 201);
}

async function generateNew({ send }: Context, body: Record<string, unknown> = { prompt: PROMPT }): Promise<WorkflowTemplateDto> {
  return templateFrom(await send(HttpMethod.POST, `${BASE}/generate`, MANAGER, body), 201);
}

async function regenerate({ send }: Context, id: string, prompt = REVISED_PROMPT): Promise<WorkflowTemplateDto> {
  return templateFrom(await send(HttpMethod.POST, `${BASE}/${id}/generate`, MANAGER, { prompt }), 201);
}

async function publish({ send }: Context, id: string): Promise<WorkflowTemplateDto> {
  return templateFrom(await send(HttpMethod.POST, `${BASE}/${id}/publish`, MANAGER), 200);
}

test("workflow template routes require a session; task creators can read only published templates and cannot manage", async () => {
  await withServer(async (context) => {
    const { send } = context;
    await expectError(await send(HttpMethod.GET, BASE, null), 401, AuthErrorCode.AUTHENTICATION_REQUIRED);

    const template = await generateNew(context);
    const id = template.id;

    const hidden = await readJson<{ workflow_templates: WorkflowTemplateSummaryDto[] }>(await send(HttpMethod.GET, BASE, TASK_CREATOR));
    assert.deepEqual(hidden.workflow_templates, []);
    await expectError(
      await send(HttpMethod.GET, `${BASE}/${id}`, TASK_CREATOR),
      404,
      WorkflowTemplateErrorCode.WORKFLOW_TEMPLATE_NOT_FOUND,
    );

    await publish(context, id);
    const visible = await readJson<{ workflow_templates: WorkflowTemplateSummaryDto[] }>(await send(HttpMethod.GET, BASE, TASK_CREATOR));
    assert.deepEqual(visible.workflow_templates.map((item) => item.id), [id]);
    assert.equal((await send(HttpMethod.GET, `${BASE}/${id}`, TASK_CREATOR)).status, 200);
    assert.equal((await send(HttpMethod.GET, `${BASE}/${id}/versions`, TASK_CREATOR)).status, 200);
    assert.equal((await send(HttpMethod.GET, `${BASE}/${id}/versions/1`, TASK_CREATOR)).status, 200);

    const denied: Array<[HttpMethod, string, unknown]> = [
      [HttpMethod.POST, BASE, { title: "Leave", prompt: PROMPT }],
      [HttpMethod.POST, `${BASE}/generate`, { prompt: PROMPT }],
      [HttpMethod.PATCH, `${BASE}/${id}`, { title: "Renamed" }],
      [HttpMethod.POST, `${BASE}/${id}/generate`, { prompt: PROMPT }],
      [HttpMethod.POST, `${BASE}/${id}/publish`, undefined],
      [HttpMethod.POST, `${BASE}/${id}/archive`, undefined],
      [HttpMethod.POST, `${BASE}/${id}/restore`, undefined],
    ];
    for (const [method, path, body] of denied) {
      const response = await send(method, path, TASK_CREATOR, body);
      await expectError(response, 403, AuthErrorCode.PERMISSION_DENIED);
    }
    assert.deepEqual(context.testbed.generationService.prompts, [PROMPT]);
  });
});

test("POST /workflow-templates creates a draft and requires a title and prompt", async () => {
  await withServer(async (context) => {
    const { send } = context;
    await expectError(await send(HttpMethod.POST, BASE, MANAGER, { prompt: PROMPT }), 400);
    await expectError(await send(HttpMethod.POST, BASE, MANAGER, { title: "  ", prompt: PROMPT }), 400);
    await expectError(await send(HttpMethod.POST, BASE, MANAGER, { title: "Leave" }), 400);

    const draft = await createDraft(context);
    assert.equal(draft.title, "Overseas Leave");
    assert.equal(draft.status, WorkflowTemplateStatus.DRAFT);
    assert.equal(draft.draft_prompt, PROMPT);
    assert.equal(draft.current_version, null);
    assert.equal(draft.current, null);
    assert.equal(draft.has_ungenerated_changes, false);
    assert.equal(draft.created_by?.full_name, MANAGER_NAME);
    assert.deepEqual(context.testbed.generationService.prompts, []);
  });
});

test("GET /workflow-templates lists templates with resolved user names and hides archived ones", async () => {
  await withServer(async (context) => {
    const { send } = context;
    const active = await createDraft(context, "Active Leave");
    const archived = await createDraft(context, "Archived Leave");
    await send(HttpMethod.POST, `${BASE}/${archived.id}/archive`, TestIdentity.ADMINISTRATOR);

    const listed = await readJson<{ workflow_templates: WorkflowTemplateSummaryDto[] }>(await send(HttpMethod.GET, BASE, MANAGER));
    assert.deepEqual(listed.workflow_templates.map((template) => template.id), [active.id]);
    assert.equal(listed.workflow_templates[0]?.created_by?.full_name, MANAGER_NAME);
    assert.equal(listed.workflow_templates[0]?.updated_by?.full_name, MANAGER_NAME);

    const all = await readJson<{ workflow_templates: WorkflowTemplateSummaryDto[] }>(
      await send(HttpMethod.GET, `${BASE}?include_archived=true`, MANAGER),
    );
    const archivedSummary = all.workflow_templates.find((template) => template.id === archived.id);
    assert.equal(all.workflow_templates.length, 2);
    assert.equal(archivedSummary?.is_archived, true);
    assert.equal(archivedSummary?.updated_by?.full_name, TEST_USERS[TestIdentity.ADMINISTRATOR].fullName);

    await expectError(await send(HttpMethod.GET, `${BASE}?include_archived=yes`, MANAGER), 400);
  });
});

test("GET /workflow-templates/:id returns the template, 404 when missing and 400 for a malformed id", async () => {
  await withServer(async (context) => {
    const { send } = context;
    const template = await generateNew(context);

    const found = await templateFrom(await send(HttpMethod.GET, `${BASE}/${template.id}`, MANAGER), 200);
    assert.equal(found.id, template.id);
    assert.equal(found.current?.version, 1);

    await expectError(
      await send(HttpMethod.GET, `${BASE}/${randomUUID()}`, MANAGER),
      404,
      WorkflowTemplateErrorCode.WORKFLOW_TEMPLATE_NOT_FOUND,
    );
    await expectError(await send(HttpMethod.GET, `${BASE}/not-a-uuid`, MANAGER), 400);
  });
});

test("POST /workflow-templates/generate uses the model title unless one is supplied", async () => {
  await withServer(async (context) => {
    const generated = await generateNew(context);
    assert.equal(generated.title, GENERATED.title);
    assert.equal(generated.status, WorkflowTemplateStatus.UNPUBLISHED);
    assert.equal(generated.current_version, 1);
    assert.equal(generated.current?.version, 1);
    assert.equal(generated.current?.prompt, PROMPT);
    assert.equal(generated.current?.created_by?.full_name, MANAGER_NAME);
    assert.equal(generated.draft_prompt, null);
    assert.equal(generated.description, GENERATED.definition.description);
    assert.equal("title" in (generated.current?.definition ?? {}), false);

    const titled = await generateNew(context, { title: "Custom Leave", prompt: PROMPT });
    assert.equal(titled.title, "Custom Leave");

    await expectError(await context.send(HttpMethod.POST, `${BASE}/generate`, MANAGER, { title: "Leave" }), 400);
  });
});

test("generation failures surface as 422 with the matching error code", async () => {
  await withServer(async (context) => {
    const { send, testbed } = context;
    testbed.generationService.enqueue(
      new WorkflowTemplateGenerationError("model kept producing invalid JSON"),
      workflowTemplatePromptRejected(["this is a shopping list"]),
    );

    await expectError(
      await send(HttpMethod.POST, `${BASE}/generate`, MANAGER, { prompt: PROMPT }),
      422,
      WorkflowTemplateErrorCode.WORKFLOW_TEMPLATE_GENERATION_FAILED,
    );
    const rejected = await expectError(
      await send(HttpMethod.POST, `${BASE}/generate`, MANAGER, { prompt: "Buy milk and eggs" }),
      422,
      WorkflowTemplateErrorCode.WORKFLOW_TEMPLATE_PROMPT_REJECTED,
    );
    assert.deepEqual(rejected.details, ["this is a shopping list"]);
    assert.equal(testbed.templateModel.templates.size, 0);
  });
});

test("PATCH /workflow-templates/:id renames without creating a version", async () => {
  await withServer(async (context) => {
    const { send, testbed } = context;
    const template = await generateNew(context);
    const embeddedBefore = testbed.embeddingService.embeddedTexts.length;

    const renamed = await templateFrom(await send(HttpMethod.PATCH, `${BASE}/${template.id}`, MANAGER, { title: "Renamed Leave" }), 200);
    assert.equal(renamed.title, "Renamed Leave");
    assert.equal(renamed.current_version, 1);
    assert.equal(testbed.versionModel.versions.length, 1);
    assert.equal(testbed.embeddingService.embeddedTexts.length, embeddedBefore + 1);
    assert.match(testbed.embeddingService.embeddedTexts.at(-1) ?? "", /^Renamed Leave\n/);

    await expectError(await send(HttpMethod.PATCH, `${BASE}/${template.id}`, MANAGER, { title: "" }), 400);
  });
});

test("PATCH /workflow-templates/:id saves a draft prompt and clears it when it matches the current version", async () => {
  await withServer(async (context) => {
    const { send } = context;
    const template = await generateNew(context);
    const path = `${BASE}/${template.id}`;

    const pending = await templateFrom(await send(HttpMethod.PATCH, path, MANAGER, { draft_prompt: REVISED_PROMPT }), 200);
    assert.equal(pending.draft_prompt, REVISED_PROMPT);
    assert.equal(pending.has_ungenerated_changes, true);

    const reverted = await templateFrom(await send(HttpMethod.PATCH, path, MANAGER, { draft_prompt: ` ${PROMPT} ` }), 200);
    assert.equal(reverted.draft_prompt, null);
    assert.equal(reverted.has_ungenerated_changes, false);

    const draft = await createDraft(context);
    await expectError(await send(HttpMethod.PATCH, `${BASE}/${draft.id}`, MANAGER, { draft_prompt: null }), 400);
    await expectError(await send(HttpMethod.PATCH, `${BASE}/${draft.id}`, MANAGER, { draft_prompt: 42 }), 400);
  });
});

test("POST /workflow-templates/:id/generate increments the version and moves a draft to unpublished", async () => {
  await withServer(async (context) => {
    const draft = await createDraft(context);
    const first = await regenerate(context, draft.id, PROMPT);
    assert.equal(first.status, WorkflowTemplateStatus.UNPUBLISHED);
    assert.equal(first.current_version, 1);
    assert.equal(first.title, "Overseas Leave");
    assert.equal(first.draft_prompt, null);

    const second = await regenerate(context, draft.id);
    assert.equal(second.status, WorkflowTemplateStatus.UNPUBLISHED);
    assert.equal(second.current_version, 2);
    assert.equal(second.current?.prompt, REVISED_PROMPT);
  });
});

test("regenerating a published template publishes the new version immediately", async () => {
  await withServer(async (context) => {
    const template = await generateNew(context);
    await publish(context, template.id);

    const regenerated = await regenerate(context, template.id);
    assert.equal(regenerated.status, WorkflowTemplateStatus.PUBLISHED);
    assert.equal(regenerated.current_version, 2);

    const live = await context.testbed.service.getPublishedDefinition(template.id);
    assert.equal(live.version, 2);
  });
});

test("POST /workflow-templates/:id/publish rejects drafts and already published templates", async () => {
  await withServer(async (context) => {
    const { send } = context;
    const draft = await createDraft(context);
    await expectError(
      await send(HttpMethod.POST, `${BASE}/${draft.id}/publish`, MANAGER),
      409,
      WorkflowTemplateErrorCode.WORKFLOW_TEMPLATE_NOT_GENERATED,
    );

    const template = await generateNew(context);
    const published = await publish(context, template.id);
    assert.equal(published.status, WorkflowTemplateStatus.PUBLISHED);
    await expectError(
      await send(HttpMethod.POST, `${BASE}/${template.id}/publish`, MANAGER),
      409,
      WorkflowTemplateErrorCode.WORKFLOW_TEMPLATE_ALREADY_PUBLISHED,
    );
  });
});

test("archived templates reject edits until restored", async () => {
  await withServer(async (context) => {
    const { send } = context;
    const template = await generateNew(context);
    const path = `${BASE}/${template.id}`;

    await expectError(await send(HttpMethod.POST, `${path}/restore`, MANAGER), 409, WorkflowTemplateErrorCode.WORKFLOW_TEMPLATE_NOT_ARCHIVED);

    const archived = await templateFrom(await send(HttpMethod.POST, `${path}/archive`, MANAGER), 200);
    assert.equal(archived.is_archived, true);
    assert.ok(archived.archived_at);

    for (const [method, suffix, body] of [
      [HttpMethod.POST, "/archive", undefined],
      [HttpMethod.PATCH, "", { title: "Renamed" }],
      [HttpMethod.POST, "/generate", { prompt: REVISED_PROMPT }],
      [HttpMethod.POST, "/publish", undefined],
    ] as const) {
      await expectError(await send(method, `${path}${suffix}`, MANAGER, body), 409, WorkflowTemplateErrorCode.WORKFLOW_TEMPLATE_ARCHIVED);
    }

    const restored = await templateFrom(await send(HttpMethod.POST, `${path}/restore`, MANAGER), 200);
    assert.equal(restored.is_archived, false);
    assert.equal(restored.archived_at, null);
  });
});

test("GET /workflow-templates/:id/versions lists versions newest first and fetches one by number", async () => {
  await withServer(async (context) => {
    const { send } = context;
    const template = await generateNew(context);
    await regenerate(context, template.id);

    const listed = await readJson<{ versions: WorkflowTemplateVersionSummaryDto[] }>(
      await send(HttpMethod.GET, `${BASE}/${template.id}/versions`, MANAGER),
    );
    assert.deepEqual(listed.versions.map((version) => version.version), [2, 1]);
    assert.equal(listed.versions[0]?.created_by?.full_name, MANAGER_NAME);
    assert.equal("prompt" in listed.versions[0]!, false);

    const first = await readJson<{ version: WorkflowTemplateVersionDto }>(
      await send(HttpMethod.GET, `${BASE}/${template.id}/versions/1`, MANAGER),
    );
    assert.equal(first.version.version, 1);
    assert.equal(first.version.prompt, PROMPT);
    assert.deepEqual(first.version.definition, GENERATED.definition);

    await expectError(
      await send(HttpMethod.GET, `${BASE}/${template.id}/versions/99`, MANAGER),
      404,
      WorkflowTemplateErrorCode.WORKFLOW_TEMPLATE_VERSION_NOT_FOUND,
    );
    await expectError(await send(HttpMethod.GET, `${BASE}/${template.id}/versions/0`, MANAGER), 400);
    await expectError(
      await send(HttpMethod.GET, `${BASE}/${randomUUID()}/versions`, MANAGER),
      404,
      WorkflowTemplateErrorCode.WORKFLOW_TEMPLATE_NOT_FOUND,
    );
  });
});
