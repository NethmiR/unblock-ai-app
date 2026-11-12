import { requireRouteAccess } from "@/lib/auth/session";
import { dashboardPageMetadata } from "@/lib/navigation/page-metadata";
import { RoutePath } from "@/lib/routing/route-path";

const ROUTE = RoutePath.TASKS_NEW;

export const metadata = dashboardPageMetadata(ROUTE);

export default async function NewTaskRequestPage() {
  await requireRouteAccess(ROUTE);
  return null;
}
