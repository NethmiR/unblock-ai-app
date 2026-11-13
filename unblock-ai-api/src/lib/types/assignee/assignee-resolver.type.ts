import type { OrganisationCatalogue } from "../organisation/organisation-catalogue.type.js";
import type { RequesterProfile } from "../requester/requester.type.js";
import type { WorkflowTemplateAudience } from "../selection/eligibility.type.js";
import type { TaskAssignee } from "../task/task-document.type.js";
import type { FormFieldOption } from "../task/task-form.type.js";
import type { Actor } from "../workflow/actor.type.js";

export interface AssigneeResolution {
  step_id: string;
  assignee: TaskAssignee;
  options: FormFieldOption[];
}

export interface AssigneeResolverContext {
  actor: Actor;
  stepId: string;
  profile: RequesterProfile;
  audience: WorkflowTemplateAudience;
  catalogue: OrganisationCatalogue;
}

export interface IAssigneeResolver {
  resolve(context: AssigneeResolverContext): Promise<AssigneeResolution>;
}
