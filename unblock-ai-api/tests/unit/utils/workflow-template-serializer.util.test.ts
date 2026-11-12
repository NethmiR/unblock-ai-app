import test from "node:test";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import {
  serializeWorkflowTemplate,
  serializeWorkflowTemplateSummary,
  serializeWorkflowTemplateVersion,
  serializeWorkflowTemplateVersionSummary,
} from "../../../src/utils/http/workflow-template-serializer.util.js";
import { WorkflowTemplateStatus } from "../../../src/data/constants/workflow-template.constant.js";
import { generatedFromFixture, LEAVE_WORKFLOW_TEMPLATE_ID } from "../../helpers/workflow-template.helper.js";
import type { UserReference } from "../../../src/lib/types/user/user.type.js";
import type {
  UserReferenceLookup,
  WorkflowTemplateDocument,
  WorkflowTemplateVersionDocument,
} from "../../../src/lib/types/workflow-template/workflow-template.type.js";

const CREATED_AT = new Date("2026-01-01T00:00:00.000Z");
const UPDATED_AT = new Date("2026-03-05T12:00:00.000Z");
const AUTHOR: UserReference = { id: "user-author", fullName: "Ada Author", email: "ada@example.com" };
const EDITOR: UserReference = { id: "user-editor", fullName: "Eddie Editor", email: "eddie@example.com" };
const USERS: UserReferenceLookup = new Map([
  [AUTHOR.id, AUTHOR],
  [EDITOR.id, EDITOR],
]);

function templateDoc(overrides: Partial<WorkflowTemplateDocument> = {}): WorkflowTemplateDocument {
  return {
    _id: LEAVE_WORKFLOW_TEMPLATE_ID,
    title: "Overseas Leave",
    description: "Leave for overseas travel.",
    status: WorkflowTemplateStatus.PUBLISHED,
    draft_prompt: null,
    current_version: 2,
    retrieval: null,
    created_by: AUTHOR.id,
    updated_by: EDITOR.id,
    archived_at: null,
    created_at: CREATED_AT,
    updated_at: UPDATED_AT,
    ...overrides,
  };
}

function versionDoc(overrides: Partial<WorkflowTemplateVersionDocument> = {}): WorkflowTemplateVersionDocument {
  return {
    _id: new ObjectId(),
    workflow_template_id: LEAVE_WORKFLOW_TEMPLATE_ID,
    version: 2,
    prompt: "Students travelling overseas need advisor and HOD approval.",
    definition: generatedFromFixture().definition,
    generation_attempts: 3,
    created_by: AUTHOR.id,
    created_at: CREATED_AT,
    ...overrides,
  };
}

test("the summary exposes the id, status and ISO timestamps", () => {
  const dto = serializeWorkflowTemplateSummary(templateDoc(), USERS);
  assert.equal(dto.id, LEAVE_WORKFLOW_TEMPLATE_ID);
  assert.equal(dto.status, WorkflowTemplateStatus.PUBLISHED);
  assert.equal(dto.current_version, 2);
  assert.equal(dto.created_at, "2026-01-01T00:00:00.000Z");
  assert.equal(dto.updated_at, "2026-03-05T12:00:00.000Z");
});

test("the summary resolves created_by and updated_by to user references", () => {
  const dto = serializeWorkflowTemplateSummary(templateDoc(), USERS);
  assert.deepEqual(dto.created_by, { id: AUTHOR.id, full_name: AUTHOR.fullName, email: AUTHOR.email });
  assert.deepEqual(dto.updated_by, { id: EDITOR.id, full_name: EDITOR.fullName, email: EDITOR.email });
});

test("an unknown user resolves to null", () => {
  const dto = serializeWorkflowTemplateSummary(templateDoc({ updated_by: "user-gone" }), USERS);
  assert.equal(dto.updated_by, null);
});

test("has_ungenerated_changes is true only for a generated template carrying a draft prompt", () => {
  const changed = templateDoc({ draft_prompt: "A revised prompt" });
  assert.equal(serializeWorkflowTemplateSummary(changed, USERS).has_ungenerated_changes, true);
  assert.equal(serializeWorkflowTemplateSummary(templateDoc(), USERS).has_ungenerated_changes, false);

  const draft = templateDoc({ status: WorkflowTemplateStatus.DRAFT, draft_prompt: "First prompt", current_version: null });
  assert.equal(serializeWorkflowTemplateSummary(draft, USERS).has_ungenerated_changes, false);
});

test("archive state is reported as a flag and an ISO timestamp", () => {
  const archivedAt = new Date("2026-04-01T08:30:00.000Z");
  const archived = serializeWorkflowTemplateSummary(templateDoc({ archived_at: archivedAt }), USERS);
  assert.equal(archived.is_archived, true);
  assert.equal(archived.archived_at, "2026-04-01T08:30:00.000Z");

  const active = serializeWorkflowTemplateSummary(templateDoc(), USERS);
  assert.equal(active.is_archived, false);
  assert.equal(active.archived_at, null);
});

test("a version summary omits the prompt and definition", () => {
  const dto = serializeWorkflowTemplateVersionSummary(versionDoc(), USERS);
  assert.deepEqual(dto, {
    version: 2,
    generation_attempts: 3,
    created_by: { id: AUTHOR.id, full_name: AUTHOR.fullName, email: AUTHOR.email },
    created_at: "2026-01-01T00:00:00.000Z",
  });
});

test("a full version carries the prompt and the stored definition", () => {
  const version = versionDoc();
  const dto = serializeWorkflowTemplateVersion(version, USERS);
  assert.equal(dto.prompt, version.prompt);
  assert.deepEqual(dto.definition, version.definition);
});

test("the detail embeds the draft prompt and the current version", () => {
  const version = versionDoc();
  const dto = serializeWorkflowTemplate({
    template: templateDoc({ draft_prompt: "A revised prompt" }),
    currentVersion: version,
    users: USERS,
  });
  assert.equal(dto.draft_prompt, "A revised prompt");
  assert.equal(dto.current?.version, 2);
  assert.equal(dto.current?.prompt, version.prompt);
});

test("a draft detail has no current version", () => {
  const dto = serializeWorkflowTemplate({
    template: templateDoc({ status: WorkflowTemplateStatus.DRAFT, current_version: null, draft_prompt: "First prompt" }),
    currentVersion: null,
    users: USERS,
  });
  assert.equal(dto.current, null);
  assert.equal(dto.current_version, null);
});
