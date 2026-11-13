import { ApprovalWorkspaceScreen } from "@/components/approvals/workspace/ApprovalWorkspaceScreen";
import { requireRouteAccess } from "@/lib/auth/session";
import { dashboardPageMetadata } from "@/lib/navigation/page-metadata";
import { RoutePath } from "@/lib/routing/route-path";

const ROUTE = RoutePath.APPROVALS;

export const metadata = dashboardPageMetadata(ROUTE);

export default async function ApprovalWorkspacePage({ params }: PageProps<"/dashboard/approvals/[taskId]/[stepId]">) {
  const { taskId, stepId } = await params;
  await requireRouteAccess(ROUTE);
  return <ApprovalWorkspaceScreen taskId={taskId} stepId={stepId} />;
}
