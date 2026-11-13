import { compileTaskPlan } from "../utils/task/task-plan-compiler.util.js";
import type { AssigneeResolutionService } from "./assignee-resolution.service.js";
import type { OrganisationCatalogue } from "../lib/types/organisation/organisation-catalogue.type.js";
import type { RequesterProfile } from "../lib/types/requester/requester.type.js";
import type { CompiledTaskPlan } from "../lib/types/task/task-plan.type.js";
import type { WorkflowDefinition } from "../lib/types/workflow/workflow.type.js";

export interface TaskPlanServiceOptions {
  assigneeResolutionService: Pick<AssigneeResolutionService, "resolveAll">;
}

export class TaskPlanService {
  private readonly assigneeResolutionService: Pick<AssigneeResolutionService, "resolveAll">;

  constructor({ assigneeResolutionService }: TaskPlanServiceOptions) {
    this.assigneeResolutionService = assigneeResolutionService;
  }

  async compile(definition: WorkflowDefinition, profile: RequesterProfile, catalogue: OrganisationCatalogue): Promise<CompiledTaskPlan> {
    const resolutions = await this.assigneeResolutionService.resolveAll(definition, profile, catalogue);
    return compileTaskPlan({ definition, profile, resolutions });
  }
}
