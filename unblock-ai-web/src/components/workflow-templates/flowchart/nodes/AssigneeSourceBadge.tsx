import { Badge } from "@/components/ui/Badge";
import { assigneeSourceHintBadge } from "@/lib/workflow-template/assignee-source-hint";
import type { AssigneeSource } from "@/types/task";

export function AssigneeSourceBadge({ source }: { source: AssigneeSource | null }) {
  const badge = assigneeSourceHintBadge(source);
  if (badge === null) return null;
  return (
    <Badge tone={badge.tone} title={badge.title} className="mt-2 px-2 py-px text-[11px]">
      {badge.label}
    </Badge>
  );
}
