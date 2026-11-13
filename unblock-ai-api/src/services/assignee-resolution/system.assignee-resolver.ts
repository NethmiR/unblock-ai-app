import { AssigneeSource } from "../../data/constants/assignee.constant.js";
import type { IAssigneeResolver } from "./assignee-resolver.interface.js";
import type { AssigneeResolution, AssigneeResolverContext } from "../../lib/types/assignee/assignee-resolver.type.js";

export class SystemAssigneeResolver implements IAssigneeResolver {
  async resolve({ stepId }: AssigneeResolverContext): Promise<AssigneeResolution> {
    return {
      step_id: stepId,
      assignee: {
        source: AssigneeSource.SYSTEM,
        user_id: null,
        full_name: null,
        email: null,
        designation_title: null,
        organisational_unit_name: null,
        field_id: null,
        note: null,
        candidates: [],
      },
      options: [],
    };
  }
}
