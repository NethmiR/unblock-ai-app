import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createInMemoryRepositoryRegistry } from "../../../src/repositories/repository-registry.factory.js";
import { WorkflowTemplateStatus, WorkflowTemplateVisibility } from "../../../src/data/constants/workflow-template.constant.js";
import { WorkflowTemplateErrorCode } from "../../../src/data/constants/workflow-template-error.constant.js";
import { ValidationError } from "../../../src/errors/validation.error.js";
import { WorkflowTemplateGenerationError } from "../../../src/errors/workflow-template-generation.error.js";
import { workflowTemplatePromptRejected } from "../../../src/errors/workflow-template.error.js";
import { TEST_USERS, TestIdentity } from "../../helpers/test-server.helper.js";
import { withErrorCode } from "../../helpers/error-assertion.helper.js";
import {
  createWorkflowTemplateTestbed,
  generatedFromFixture,
  type WorkflowTemplateTestbed,
} from "../../helpers/workflow-template.helper.js";
import type { WorkflowTemplateDetail } from "../../../src/lib/types/workflow-template/workflow-template.type.js";

const MANAGER = TEST_USERS[TestIdentity.WORKFLOW_MANAGER];
const ADMINISTRATOR = TEST_USERS[TestIdentity.ADMINISTRATOR];
const PROMPT = "Students travelling overseas need advisor, HOD and dean approval.";
const REVISED_PROMPT = "Students travelling overseas need advisor and dean approval only.";
const GENERATED = generatedFromFixture();

function build(): WorkflowTemplateTestbed {
  const { userRepository } = createInMemoryRepositoryRegistry({ users: [MANAGER, ADMINISTRATOR] });
  return createWorkflowTemplateTestbed(userRepository);
}

function generate(testbed: WorkflowTemplateTestbed, title: string | null = null): Promise<WorkflowTemplateDetail> {
  return testbed.service.generateNew({ title, prompt: PROMPT }, MANAGER.id);
}

async function publishNew(testbed: WorkflowTemplateTestbed): Promise<WorkflowTemplateDetail> {
  const generated = await generate(testbed);
  return testbed.service.publish(generated.template._id, MANAGER.id);
}

test("createDraft stores a normalised title and prompt without generating", async () => {
  const testbed = build();
  const detail = await testbed.service.createDraft({ title: "  Overseas   Leave ", prompt: `  ${PROMPT}  ` }, MANAGER.id);

  assert.equal(detail.template.title, "Overseas Leave");
  assert.equal(detail.template.status, WorkflowTemplateStatus.DRAFT);
  assert.equal(detail.template.draft_prompt, PROMPT);
  assert.equal(detail.template.current_version, null);
  assert.equal(detail.template.retrieval, null);
  assert.equal(detail.currentVersion, null);
  assert.equal(detail.users.get(MANAGER.id)?.fullName, MANAGER.fullName);
  assert.deepEqual(testbed.generationService.prompts, []);
  assert.equal(testbed.versionModel.versions.length, 0);
});

test("createDraft rejects a blank title or prompt", async () => {
  const testbed = build();
  await assert.rejects(testbed.service.createDraft({ title: "   ", prompt: PROMPT }, MANAGER.id), ValidationError);
  await assert.rejects(testbed.service.createDraft({ title: "Leave", prompt: "  " }, MANAGER.id), ValidationError);
  assert.equal(testbed.templateModel.templates.size, 0);
});

test("generateNew uses the model title and stores an unpublished first version", async () => {
  const testbed = build();
  const detail = await generate(testbed);

  assert.equal(detail.template.title, GENERATED.title);
  assert.equal(detail.template.status, WorkflowTemplateStatus.UNPUBLISHED);
  assert.equal(detail.template.current_version, 1);
  assert.equal(detail.template.draft_prompt, null);
  assert.equal(detail.template.description, GENERATED.definition.description);
  assert.equal(detail.currentVersion?.version, 1);
  assert.equal(detail.currentVersion?.prompt, PROMPT);
  assert.equal(detail.currentVersion?.generation_attempts, GENERATED.attempts);
  assert.deepEqual(detail.currentVersion?.definition, GENERATED.definition);
  assert.deepEqual(testbed.generationService.prompts, [PROMPT]);
});

test("generateNew prefers a requested title over the model title", async () => {
  const testbed = build();
  const detail = await generate(testbed, "  Custom   Leave Title ");

  assert.equal(detail.template.title, "Custom Leave Title");
  assert.match(detail.template.retrieval?.text ?? "", /^Custom Leave Title\n/);
});

test("generateNew builds the retrieval projection from the title and retrieval summary", async () => {
  const testbed = build();
  const detail = await generate(testbed);
  const retrieval = detail.template.retrieval;

  assert.ok(retrieval);
  assert.ok(retrieval.text.startsWith(`${GENERATED.title}\n${GENERATED.definition.retrieval_summary.one_liner}\n`));
  assert.deepEqual(retrieval.retrieval_summary, GENERATED.definition.retrieval_summary);
  assert.equal(retrieval.institution_type, GENERATED.definition.scope.institution_type);
  assert.equal(retrieval.model, "fake-embedding");
  assert.deepEqual(testbed.embeddingService.embeddedTexts, [retrieval.text]);
});

test("generation failures propagate and persist nothing", async () => {
  const testbed = build();
  testbed.generationService.enqueue(
    new WorkflowTemplateGenerationError("model kept producing invalid JSON"),
    workflowTemplatePromptRejected(["this is a shopping list"]),
  );

  await assert.rejects(generate(testbed), withErrorCode(WorkflowTemplateErrorCode.WORKFLOW_TEMPLATE_GENERATION_FAILED));
  await assert.rejects(generate(testbed), withErrorCode(WorkflowTemplateErrorCode.WORKFLOW_TEMPLATE_PROMPT_REJECTED));
  assert.equal(testbed.templateModel.templates.size, 0);
  assert.equal(testbed.versionModel.versions.length, 0);
});

test("regenerating a draft produces version 1 and moves it to unpublished", async () => {
  const testbed = build();
  const draft = await testbed.service.createDraft({ title: "Overseas Leave", prompt: PROMPT }, MANAGER.id);
  const detail = await testbed.service.regenerate(draft.template._id, { title: null, prompt: PROMPT }, ADMINISTRATOR.id);

  assert.equal(detail.template.status, WorkflowTemplateStatus.UNPUBLISHED);
  assert.equal(detail.template.current_version, 1);
  assert.equal(detail.template.draft_prompt, null);
  assert.equal(detail.template.title, "Overseas Leave");
  assert.equal(detail.template.updated_by, ADMINISTRATOR.id);
  assert.equal(detail.users.get(ADMINISTRATOR.id)?.fullName, ADMINISTRATOR.fullName);
});

test("regenerating an unpublished template increments the version and keeps the template title", async () => {
  const testbed = build();
  const first = await generate(testbed, "Overseas Leave");
  testbed.generationService.enqueue(generatedFromFixture(undefined, { title: "Something Else Entirely", attempts: 2 }));
  const second = await testbed.service.regenerate(first.template._id, { title: null, prompt: REVISED_PROMPT }, MANAGER.id);

  assert.equal(second.template.status, WorkflowTemplateStatus.UNPUBLISHED);
  assert.equal(second.template.current_version, 2);
  assert.equal(second.template.title, "Overseas Leave");
  assert.equal(second.currentVersion?.prompt, REVISED_PROMPT);
  assert.equal(second.currentVersion?.generation_attempts, 2);
});

test("regenerating a published template publishes the new version immediately and keeps old versions intact", async () => {
  const testbed = build();
  const published = await publishNew(testbed);
  const regenerated = await testbed.service.regenerate(published.template._id, { title: null, prompt: REVISED_PROMPT }, MANAGER.id);

  assert.equal(regenerated.template.status, WorkflowTemplateStatus.PUBLISHED);
  assert.equal(regenerated.template.current_version, 2);

  const live = await testbed.service.getPublishedDefinition(published.template._id);
  assert.equal(live.version, 2);

  const original = await testbed.service.getVersion(published.template._id, 1, WorkflowTemplateVisibility.ALL);
  assert.equal(original.version.prompt, PROMPT);
});

test("regenerate applies a new title only when generation succeeds", async () => {
  const testbed = build();
  const generated = await generate(testbed, "Original Leave");
  const id = generated.template._id;

  testbed.generationService.enqueue(new WorkflowTemplateGenerationError("model kept producing invalid JSON"));
  await assert.rejects(testbed.service.regenerate(id, { title: "Renamed Leave", prompt: REVISED_PROMPT }, MANAGER.id));
  assert.equal((await testbed.service.get(id, WorkflowTemplateVisibility.ALL)).template.title, "Original Leave");

  const regenerated = await testbed.service.regenerate(id, { title: "Renamed Leave", prompt: REVISED_PROMPT }, MANAGER.id);
  assert.equal(regenerated.template.title, "Renamed Leave");
  assert.equal(regenerated.template.current_version, 2);
  assert.match(regenerated.template.retrieval?.text ?? "", /^Renamed Leave/);
});

test("updating the title creates no version and re-embeds a generated template", async () => {
  const testbed = build();
  const generated = await generate(testbed);
  const embeddedBefore = testbed.embeddingService.embeddedTexts.length;

  const updated = await testbed.service.update(generated.template._id, { title: "Renamed Leave" }, ADMINISTRATOR.id);

  assert.equal(updated.template.title, "Renamed Leave");
  assert.equal(updated.template.current_version, 1);
  assert.equal(updated.template.updated_by, ADMINISTRATOR.id);
  assert.equal(testbed.versionModel.versions.length, 1);
  assert.equal(testbed.embeddingService.embeddedTexts.length, embeddedBefore + 1);
  assert.match(updated.template.retrieval?.text ?? "", /^Renamed Leave\n/);

  const definition = await testbed.service.getDefinition(generated.template._id, 1);
  assert.equal(definition.title, "Renamed Leave");
  assert.deepEqual(definition.steps, GENERATED.definition.steps);
});

test("updating the title of a draft does not embed anything", async () => {
  const testbed = build();
  const draft = await testbed.service.createDraft({ title: "Overseas Leave", prompt: PROMPT }, MANAGER.id);

  const updated = await testbed.service.update(draft.template._id, { title: "Renamed Leave" }, MANAGER.id);

  assert.equal(updated.template.title, "Renamed Leave");
  assert.equal(updated.template.retrieval, null);
  assert.deepEqual(testbed.embeddingService.embeddedTexts, []);
});

test("an update that changes nothing writes nothing", async () => {
  const testbed = build();
  const generated = await generate(testbed);

  const updated = await testbed.service.update(generated.template._id, { title: ` ${GENERATED.title} ` }, ADMINISTRATOR.id);

  assert.equal(updated.template.updated_by, MANAGER.id);
  assert.equal(updated.template.updated_at.getTime(), generated.template.updated_at.getTime());
});

test("saving a draft prompt keeps it until it matches the current version prompt", async () => {
  const testbed = build();
  const generated = await generate(testbed);
  const id = generated.template._id;

  const pending = await testbed.service.update(id, { draftPrompt: REVISED_PROMPT }, MANAGER.id);
  assert.equal(pending.template.draft_prompt, REVISED_PROMPT);

  const reverted = await testbed.service.update(id, { draftPrompt: `  ${PROMPT}\n` }, MANAGER.id);
  assert.equal(reverted.template.draft_prompt, null);
});

test("a generated template may discard its draft prompt but a draft may not", async () => {
  const testbed = build();
  const generated = await generate(testbed);
  await testbed.service.update(generated.template._id, { draftPrompt: REVISED_PROMPT }, MANAGER.id);
  const cleared = await testbed.service.update(generated.template._id, { draftPrompt: null }, MANAGER.id);
  assert.equal(cleared.template.draft_prompt, null);

  const draft = await testbed.service.createDraft({ title: "Overseas Leave", prompt: PROMPT }, MANAGER.id);
  await assert.rejects(testbed.service.update(draft.template._id, { draftPrompt: null }, MANAGER.id), ValidationError);

  const revised = await testbed.service.update(draft.template._id, { draftPrompt: REVISED_PROMPT }, MANAGER.id);
  assert.equal(revised.template.draft_prompt, REVISED_PROMPT);
});

test("publish requires a generated, unpublished template", async () => {
  const testbed = build();
  const draft = await testbed.service.createDraft({ title: "Overseas Leave", prompt: PROMPT }, MANAGER.id);
  await assert.rejects(
    testbed.service.publish(draft.template._id, MANAGER.id),
    withErrorCode(WorkflowTemplateErrorCode.WORKFLOW_TEMPLATE_NOT_GENERATED),
  );

  const published = await publishNew(testbed);
  assert.equal(published.template.status, WorkflowTemplateStatus.PUBLISHED);
  await assert.rejects(
    testbed.service.publish(published.template._id, MANAGER.id),
    withErrorCode(WorkflowTemplateErrorCode.WORKFLOW_TEMPLATE_ALREADY_PUBLISHED),
  );
});

test("getPublishedDefinition serves only published, active templates with the template title", async () => {
  const testbed = build();
  const unpublished = await generate(testbed, "Overseas Leave");
  await assert.rejects(
    testbed.service.getPublishedDefinition(unpublished.template._id),
    withErrorCode(WorkflowTemplateErrorCode.WORKFLOW_TEMPLATE_NOT_PUBLISHED),
  );

  await testbed.service.publish(unpublished.template._id, MANAGER.id);
  const live = await testbed.service.getPublishedDefinition(unpublished.template._id);
  assert.equal(live.version, 1);
  assert.equal(live.definition.title, "Overseas Leave");

  await testbed.service.archive(unpublished.template._id, MANAGER.id);
  await assert.rejects(
    testbed.service.getPublishedDefinition(unpublished.template._id),
    withErrorCode(WorkflowTemplateErrorCode.WORKFLOW_TEMPLATE_NOT_PUBLISHED),
  );
});

test("an archived template rejects edits until it is restored", async () => {
  const testbed = build();
  const generated = await generate(testbed);
  const id = generated.template._id;

  const archived = await testbed.service.archive(id, ADMINISTRATOR.id);
  assert.ok(archived.template.archived_at instanceof Date);
  assert.equal(archived.template.updated_by, ADMINISTRATOR.id);

  const isArchived = withErrorCode(WorkflowTemplateErrorCode.WORKFLOW_TEMPLATE_ARCHIVED);
  await assert.rejects(testbed.service.archive(id, MANAGER.id), isArchived);
  await assert.rejects(testbed.service.update(id, { title: "Renamed" }, MANAGER.id), isArchived);
  await assert.rejects(testbed.service.regenerate(id, { title: null, prompt: REVISED_PROMPT }, MANAGER.id), isArchived);
  await assert.rejects(testbed.service.publish(id, MANAGER.id), isArchived);

  const restored = await testbed.service.restore(id, MANAGER.id);
  assert.equal(restored.template.archived_at, null);
  await assert.rejects(
    testbed.service.restore(id, MANAGER.id),
    withErrorCode(WorkflowTemplateErrorCode.WORKFLOW_TEMPLATE_NOT_ARCHIVED),
  );
});

test("list hides archived templates unless asked and resolves the users involved", async () => {
  const testbed = build();
  const active = await generate(testbed, "Active Leave");
  const archived = await generate(testbed, "Archived Leave");
  await testbed.service.archive(archived.template._id, ADMINISTRATOR.id);

  const visible = await testbed.service.list({ includeArchived: false, visibility: WorkflowTemplateVisibility.ALL });
  assert.deepEqual(visible.templates.map((template) => template._id), [active.template._id]);
  assert.equal(visible.templates[0]?.retrieval, undefined);

  const everything = await testbed.service.list({ includeArchived: true, visibility: WorkflowTemplateVisibility.ALL });
  assert.deepEqual(
    everything.templates.map((template) => template._id).sort(),
    [active.template._id, archived.template._id].sort(),
  );
  assert.equal(everything.users.get(MANAGER.id)?.fullName, MANAGER.fullName);
  assert.equal(everything.users.get(ADMINISTRATOR.id)?.fullName, ADMINISTRATOR.fullName);
});

test("listVersions returns summaries newest first and getVersion returns one version", async () => {
  const testbed = build();
  const generated = await generate(testbed);
  await testbed.service.regenerate(generated.template._id, { title: null, prompt: REVISED_PROMPT }, ADMINISTRATOR.id);

  const { versions, users } = await testbed.service.listVersions(generated.template._id, WorkflowTemplateVisibility.ALL);
  assert.deepEqual(versions.map((version) => version.version), [2, 1]);
  assert.equal("prompt" in versions[0]!, false);
  assert.equal(users.get(ADMINISTRATOR.id)?.fullName, ADMINISTRATOR.fullName);

  const found = await testbed.service.getVersion(generated.template._id, 2, WorkflowTemplateVisibility.ALL);
  assert.equal(found.version.prompt, REVISED_PROMPT);
  assert.equal(found.users.get(ADMINISTRATOR.id)?.fullName, ADMINISTRATOR.fullName);
});

test("missing templates and versions raise not-found errors", async () => {
  const testbed = build();
  const generated = await generate(testbed);

  await assert.rejects(testbed.service.get(randomUUID(), WorkflowTemplateVisibility.ALL), withErrorCode(WorkflowTemplateErrorCode.WORKFLOW_TEMPLATE_NOT_FOUND));
  await assert.rejects(
    testbed.service.listVersions(randomUUID(), WorkflowTemplateVisibility.ALL),
    withErrorCode(WorkflowTemplateErrorCode.WORKFLOW_TEMPLATE_NOT_FOUND),
  );
  await assert.rejects(
    testbed.service.getVersion(generated.template._id, 9, WorkflowTemplateVisibility.ALL),
    withErrorCode(WorkflowTemplateErrorCode.WORKFLOW_TEMPLATE_VERSION_NOT_FOUND),
  );
  await assert.rejects(
    testbed.service.getDefinition(generated.template._id, 9),
    withErrorCode(WorkflowTemplateErrorCode.WORKFLOW_TEMPLATE_VERSION_NOT_FOUND),
  );
});
