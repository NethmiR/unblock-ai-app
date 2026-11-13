import { WORKFLOW_TEMPLATE_COPY } from "./workflow-template-copy";
import { AssigneeSource } from "@/types/task";
import type { Actor } from "@/types/workflow";

const COPY = WORKFLOW_TEMPLATE_COPY.flowchart.assigneeSource;

export interface AssigneeSourceHintBadge {
  label: string;
  title: string;
  tone: "success" | "warn";
}

export const ASSIGNEE_SOURCE_HINT_BADGE: Record<AssigneeSource, AssigneeSourceHintBadge | null> = {
  [AssigneeSource.DIRECTORY]: { label: COPY.directory, title: COPY.directoryTitle, tone: "success" },
  [AssigneeSource.REQUESTER_SUPPLIED]: { label: COPY.requesterProvides, title: COPY.requesterProvidesTitle, tone: "warn" },
  [AssigneeSource.REQUESTER_CHOICE]: null,
  [AssigneeSource.REQUESTER]: null,
  [AssigneeSource.SYSTEM]: null,
};

export function assigneeSourceHintBadge(source: AssigneeSource | null): AssigneeSourceHintBadge | null {
  return source === null ? null : ASSIGNEE_SOURCE_HINT_BADGE[source];
}

export function assigneeSourceHint(actor: Actor, designationCodes: ReadonlySet<string>): AssigneeSource {
  switch (actor.resolution) {
    case "requester":
      return AssigneeSource.REQUESTER;
    case "system":
      return AssigneeSource.SYSTEM;
    case "dynamic":
    case "static":
      return actor.role !== null && designationCodes.has(actor.role) ? AssigneeSource.DIRECTORY : AssigneeSource.REQUESTER_SUPPLIED;
    default: {
      const unreachable: never = actor.resolution;
      return unreachable;
    }
  }
}
