import { WorkflowTemplatesScreen } from "@/components/workflow-templates/list/WorkflowTemplatesScreen";
import { requireRouteAccess } from "@/lib/auth/session";
import { dashboardPageMetadata } from "@/lib/navigation/page-metadata";
import { RoutePath } from "@/lib/routing/route-path";

const ROUTE = RoutePath.WORKFLOWS;

export const metadata = dashboardPageMetadata(ROUTE);

export default async function WorkflowTemplatesPage() {
  await requireRouteAccess(ROUTE);
  return <WorkflowTemplatesScreen />;
}
