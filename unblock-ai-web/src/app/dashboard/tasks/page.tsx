import { TaskRequestsScreen } from "@/components/task-requests/list/TaskRequestsScreen";
import { requireRouteAccess } from "@/lib/auth/session";
import { dashboardPageMetadata } from "@/lib/navigation/page-metadata";
import { RoutePath } from "@/lib/routing/route-path";

const ROUTE = RoutePath.TASKS;

export const metadata = dashboardPageMetadata(ROUTE);

export default async function TaskRequestsPage() {
  await requireRouteAccess(ROUTE);
  return <TaskRequestsScreen />;
}
