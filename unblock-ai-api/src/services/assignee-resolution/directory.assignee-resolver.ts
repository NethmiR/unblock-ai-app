import {
  ASSIGNEE_OPTION_DESCRIPTION_SEPARATOR,
  AssigneeResolutionNote,
  AssigneeSource,
} from "../../data/constants/assignee.constant.js";
import { contextUnitIds } from "../../utils/assignee/assignee-context-unit.util.js";
import { assigneeFieldId } from "../../utils/task/task-field-id.util.js";
import type { IAssigneeResolver } from "./assignee-resolver.interface.js";
import type { IUserAffiliationRepository } from "../../repositories/user-affiliation-repository/user-affiliation-repository.interface.js";
import type { AssigneeResolution, AssigneeResolverContext } from "../../lib/types/assignee/assignee-resolver.type.js";
import type { DesignationRecord } from "../../lib/types/designation/designation.type.js";
import type { TaskAssignee } from "../../lib/types/task/task-document.type.js";
import type { FormFieldOption } from "../../lib/types/task/task-form.type.js";
import type { DesignationHolderRecord } from "../../lib/types/user-affiliation/user-affiliation.type.js";
import type { ActorResolution } from "../../lib/types/workflow/actor.type.js";

const STATIC_RESOLUTION: ActorResolution = "static";

export type DesignationHolderLookup = Pick<IUserAffiliationRepository, "findDesignationHolders">;

export interface DirectoryAssigneeResolverOptions {
  holderLookup: DesignationHolderLookup;
}

interface HolderSearch {
  designation: DesignationRecord;
  holders: DesignationHolderRecord[];
  skippedRequester: boolean;
}

function emptyAssignee(source: AssigneeSource, stepId: string, note: AssigneeResolutionNote | null): TaskAssignee {
  return {
    source,
    user_id: null,
    full_name: null,
    email: null,
    designation_title: null,
    organisational_unit_name: null,
    field_id: assigneeFieldId(stepId),
    note,
    candidates: [],
  };
}

function uniqueByHolder(holders: readonly DesignationHolderRecord[]): DesignationHolderRecord[] {
  const seen = new Set<string>();
  return holders.filter((holder) => {
    if (seen.has(holder.holder.id)) return false;
    seen.add(holder.holder.id);
    return true;
  });
}

export class DirectoryAssigneeResolver implements IAssigneeResolver {
  private readonly holderLookup: DesignationHolderLookup;

  constructor({ holderLookup }: DirectoryAssigneeResolverOptions) {
    this.holderLookup = holderLookup;
  }

  async resolve(context: AssigneeResolverContext): Promise<AssigneeResolution> {
    const { actor, stepId, catalogue } = context;
    const designation = actor.role === null ? undefined : catalogue.designationsByCode.get(actor.role);
    if (designation === undefined) return this.requesterSupplied(stepId, AssigneeResolutionNote.NOT_A_DESIGNATION);

    const primary = await this.searchHolders(context, designation);
    if (primary.holders.length > 0) return this.fromHolders(context, primary, null);

    const fallback = actor.fallback_role === null ? undefined : catalogue.designationsByCode.get(actor.fallback_role);
    if (fallback !== undefined) {
      const secondary = await this.searchHolders(context, fallback);
      if (secondary.holders.length > 0) return this.fromHolders(context, secondary, AssigneeResolutionNote.RESOLVED_BY_FALLBACK);
    }

    const note = primary.skippedRequester ? AssigneeResolutionNote.HOLDER_IS_REQUESTER : AssigneeResolutionNote.NO_HOLDER;
    return this.requesterSupplied(stepId, note);
  }

  private async searchHolders(context: AssigneeResolverContext, designation: DesignationRecord): Promise<HolderSearch> {
    const { actor, profile, audience, catalogue } = context;
    const unitIds = actor.resolution === STATIC_RESOLUTION ? null : contextUnitIds(profile, audience, designation, catalogue);
    const found = uniqueByHolder(await this.holderLookup.findDesignationHolders(designation.id, unitIds));
    const holders = found.filter((holder) => holder.holder.id !== profile.userId);
    return { designation, holders, skippedRequester: holders.length < found.length };
  }

  private fromHolders(
    context: AssigneeResolverContext,
    search: HolderSearch,
    resolvedNote: AssigneeResolutionNote | null,
  ): AssigneeResolution {
    const unitNames = new Map(context.catalogue.units.map((unit) => [unit.id, unit.name]));
    const unitNameOf = (holder: DesignationHolderRecord): string | null => unitNames.get(holder.organisationalUnitId) ?? null;
    const [only] = search.holders;

    if (search.holders.length === 1 && only !== undefined) {
      return {
        step_id: context.stepId,
        assignee: {
          source: AssigneeSource.DIRECTORY,
          user_id: only.holder.id,
          full_name: only.holder.fullName,
          email: only.holder.email,
          designation_title: search.designation.title,
          organisational_unit_name: unitNameOf(only),
          field_id: null,
          note: resolvedNote,
          candidates: [],
        },
        options: [],
      };
    }

    const options: FormFieldOption[] = search.holders.map((holder) => ({
      value: holder.holder.id,
      label: holder.holder.fullName,
      description: [search.designation.title, unitNameOf(holder)]
        .filter((part): part is string => part !== null)
        .join(ASSIGNEE_OPTION_DESCRIPTION_SEPARATOR),
    }));
    return {
      step_id: context.stepId,
      assignee: {
        ...emptyAssignee(AssigneeSource.REQUESTER_CHOICE, context.stepId, AssigneeResolutionNote.MULTIPLE_HOLDERS),
        designation_title: search.designation.title,
        candidates: search.holders.map((holder) => ({
          user_id: holder.holder.id,
          name: holder.holder.fullName,
          email: holder.holder.email,
        })),
      },
      options,
    };
  }

  private requesterSupplied(stepId: string, note: AssigneeResolutionNote): AssigneeResolution {
    return { step_id: stepId, assignee: emptyAssignee(AssigneeSource.REQUESTER_SUPPLIED, stepId, note), options: [] };
  }
}
