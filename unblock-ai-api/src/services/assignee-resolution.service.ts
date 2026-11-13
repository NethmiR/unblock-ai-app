import { assigneeFieldId } from "../utils/task/task-field-id.util.js";
import type { AssigneeResolverRegistry } from "./assignee-resolution/index.assignee-resolver.js";
import type { AssigneeResolution } from "../lib/types/assignee/assignee-resolver.type.js";
import type { OrganisationCatalogue } from "../lib/types/organisation/organisation-catalogue.type.js";
import type { RequesterProfile } from "../lib/types/requester/requester.type.js";
import type { WorkflowTemplateAudience } from "../lib/types/selection/eligibility.type.js";
import type { Actor } from "../lib/types/workflow/actor.type.js";
import type { WorkflowDefinition } from "../lib/types/workflow/workflow.type.js";

export interface AssigneeResolutionServiceOptions {
  registry: AssigneeResolverRegistry;
}

function memoKey(actor: Actor): string {
  return JSON.stringify([actor.resolution, actor.role, actor.fallback_role, actor.relative_to]);
}

function rebind(resolution: AssigneeResolution, stepId: string): AssigneeResolution {
  const { assignee } = resolution;
  return {
    step_id: stepId,
    assignee: {
      ...assignee,
      field_id: assignee.field_id === null ? null : assigneeFieldId(stepId),
      candidates: [...assignee.candidates],
    },
    options: [...resolution.options],
  };
}

export function audienceOf(definition: WorkflowDefinition): WorkflowTemplateAudience {
  return {
    actorType: definition.scope.applies_to.actor_type,
    organisationalUnitCodes: [...definition.scope.applies_to.organisational_unit_codes],
  };
}

export class AssigneeResolutionService {
  private readonly registry: AssigneeResolverRegistry;

  constructor({ registry }: AssigneeResolutionServiceOptions) {
    this.registry = registry;
  }

  async resolveAll(
    definition: WorkflowDefinition,
    profile: RequesterProfile,
    catalogue: OrganisationCatalogue,
  ): Promise<AssigneeResolution[]> {
    const audience = audienceOf(definition);
    const memo = new Map<string, Promise<AssigneeResolution>>();
    return Promise.all(
      definition.steps.map(async (step) => {
        const key = memoKey(step.assignee);
        let pending = memo.get(key);
        if (pending === undefined) {
          pending = this.registry[step.assignee.resolution].resolve({
            actor: step.assignee,
            stepId: step.id,
            profile,
            audience,
            catalogue,
          });
          memo.set(key, pending);
        }
        return rebind(await pending, step.id);
      }),
    );
  }
}
