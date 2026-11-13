import { DirectoryAssigneeResolver, type DesignationHolderLookup } from "./directory.assignee-resolver.js";
import { RequesterAssigneeResolver } from "./requester.assignee-resolver.js";
import { SystemAssigneeResolver } from "./system.assignee-resolver.js";
import type { IAssigneeResolver } from "./assignee-resolver.interface.js";
import type { ActorResolution } from "../../lib/types/workflow/actor.type.js";

export { DirectoryAssigneeResolver, type DesignationHolderLookup } from "./directory.assignee-resolver.js";
export { RequesterAssigneeResolver } from "./requester.assignee-resolver.js";
export { SystemAssigneeResolver } from "./system.assignee-resolver.js";
export type { IAssigneeResolver } from "./assignee-resolver.interface.js";

export type AssigneeResolverRegistry = Readonly<Record<ActorResolution, IAssigneeResolver>>;

export interface AssigneeResolverRegistryDependencies {
  holderLookup: DesignationHolderLookup;
}

export function createAssigneeResolverRegistry({ holderLookup }: AssigneeResolverRegistryDependencies): AssigneeResolverRegistry {
  const directory = new DirectoryAssigneeResolver({ holderLookup });
  return Object.freeze({
    dynamic: directory,
    static: directory,
    requester: new RequesterAssigneeResolver(),
    system: new SystemAssigneeResolver(),
  });
}
