import Link from "next/link";
import { Icon } from "@/components/ui/icons/Icon";
import { RoutePath } from "@/lib/routing/route-path";
import { WORKFLOW_TEMPLATE_COPY } from "@/lib/workflow-template/workflow-template-copy";
import { IconName } from "@/types/icon";

export function WorkflowTemplateBackLink() {
  return (
    <Link
      href={RoutePath.WORKFLOWS}
      className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted transition-colors hover:text-ink"
    >
      <Icon name={IconName.CHEVRON_RIGHT} className="h-4 w-4 rotate-180" />
      {WORKFLOW_TEMPLATE_COPY.editor.backToList}
    </Link>
  );
}
