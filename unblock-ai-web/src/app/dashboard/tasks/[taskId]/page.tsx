import { TaskWorkspaceScreen } from "@/components/task-requests/workspace/TaskWorkspaceScreen";
import { requireRouteAccess } from "@/lib/auth/session";
import { dashboardPageMetadata } from "@/lib/navigation/page-metadata";
import { RoutePath } from "@/lib/routing/route-path";

const ROUTE = RoutePath.TASKS;

export const metadata = dashboardPageMetadata(ROUTE);

export default async function TaskRequestPage({ params }: PageProps<"/dashboard/tasks/[taskId]">) {
  const { taskId } = await params;
  await requireRouteAccess(ROUTE);
  return <TaskWorkspaceScreen taskId={taskId} />;
}
