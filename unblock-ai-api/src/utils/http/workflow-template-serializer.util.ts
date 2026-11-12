import { serializeUserReference } from "./user-serializer.util.js";
import { WorkflowTemplateStatus } from "../../data/constants/workflow-template.constant.js";
import type { UserReferenceDto } from "../../lib/types/user/user.type.js";
import type {
  UserReferenceLookup,
  WorkflowTemplateDetail,
  WorkflowTemplateDocument,
  WorkflowTemplateDto,
  WorkflowTemplateSummaryDto,
  WorkflowTemplateVersionDocument,
  WorkflowTemplateVersionDto,
  WorkflowTemplateVersionSummaryDocument,
  WorkflowTemplateVersionSummaryDto,
} from "../../lib/types/workflow-template/workflow-template.type.js";

function serializeUser(users: UserReferenceLookup, id: string): UserReferenceDto | null {
  const user = users.get(id);
  return user ? serializeUserReference(user) : null;
}

export function serializeWorkflowTemplateSummary(
  template: WorkflowTemplateDocument,
  users: UserReferenceLookup,
): WorkflowTemplateSummaryDto {
  return {
    id: template._id,
    title: template.title,
    description: template.description,
    status: template.status,
    current_version: template.current_version,
    has_ungenerated_changes: template.status !== WorkflowTemplateStatus.DRAFT && template.draft_prompt !== null,
    is_archived: template.archived_at !== null,
    archived_at: template.archived_at?.toISOString() ?? null,
    created_by: serializeUser(users, template.created_by),
    updated_by: serializeUser(users, template.updated_by),
    created_at: template.created_at.toISOString(),
    updated_at: template.updated_at.toISOString(),
  };
}

export function serializeWorkflowTemplateVersionSummary(
  version: WorkflowTemplateVersionSummaryDocument,
  users: UserReferenceLookup,
): WorkflowTemplateVersionSummaryDto {
  return {
    version: version.version,
    generation_attempts: version.generation_attempts,
    created_by: serializeUser(users, version.created_by),
    created_at: version.created_at.toISOString(),
  };
}

export function serializeWorkflowTemplateVersion(
  version: WorkflowTemplateVersionDocument,
  users: UserReferenceLookup,
): WorkflowTemplateVersionDto {
  return {
    ...serializeWorkflowTemplateVersionSummary(version, users),
    prompt: version.prompt,
    definition: version.definition,
  };
}

export function serializeWorkflowTemplate({ template, currentVersion, users }: WorkflowTemplateDetail): WorkflowTemplateDto {
  return {
    ...serializeWorkflowTemplateSummary(template, users),
    draft_prompt: template.draft_prompt,
    current: currentVersion ? serializeWorkflowTemplateVersion(currentVersion, users) : null,
  };
}
