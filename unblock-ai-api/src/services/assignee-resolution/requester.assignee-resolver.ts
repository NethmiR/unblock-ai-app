import { AssigneeSource } from "../../data/constants/assignee.constant.js";
import type { IAssigneeResolver } from "./assignee-resolver.interface.js";
import type { AssigneeResolution, AssigneeResolverContext } from "../../lib/types/assignee/assignee-resolver.type.js";

export class RequesterAssigneeResolver implements IAssigneeResolver {
  async resolve({ stepId, profile }: AssigneeResolverContext): Promise<AssigneeResolution> {
    return {
      step_id: stepId,
      assignee: {
        source: AssigneeSource.REQUESTER,
        user_id: profile.userId,
        full_name: profile.fullName,
        email: profile.email,
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
