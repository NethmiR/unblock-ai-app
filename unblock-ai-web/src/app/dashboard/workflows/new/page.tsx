import { WorkflowTemplateEditor } from "@/components/workflow-templates/editor/WorkflowTemplateEditor";
import { requireRouteAccess } from "@/lib/auth/session";
import { dashboardPageMetadata } from "@/lib/navigation/page-metadata";
import { RoutePath } from "@/lib/routing/route-path";

const ROUTE = RoutePath.WORKFLOWS_NEW;

export const metadata = dashboardPageMetadata(ROUTE);

export default async function NewWorkflowTemplatePage() {
  await requireRouteAccess(ROUTE);
  return <WorkflowTemplateEditor template={null} />;
}
