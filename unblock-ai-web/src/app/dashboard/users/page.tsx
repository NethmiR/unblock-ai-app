import { UsersScreen } from "@/components/users/list/UsersScreen";
import { requireRouteAccess } from "@/lib/auth/session";
import { dashboardPageMetadata } from "@/lib/navigation/page-metadata";
import { RoutePath } from "@/lib/routing/route-path";

const ROUTE = RoutePath.USERS;

export const metadata = dashboardPageMetadata(ROUTE);

export default async function UsersPage() {
  await requireRouteAccess(ROUTE);
  return <UsersScreen />;
}
