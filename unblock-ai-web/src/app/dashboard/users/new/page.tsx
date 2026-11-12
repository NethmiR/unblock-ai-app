import { NewUserScreen } from "@/components/users/create/NewUserScreen";
import { requireRouteAccess } from "@/lib/auth/session";
import { dashboardPageMetadata } from "@/lib/navigation/page-metadata";
import { RoutePath } from "@/lib/routing/route-path";

const ROUTE = RoutePath.USERS_NEW;

export const metadata = dashboardPageMetadata(ROUTE);

export default async function NewUserPage() {
  await requireRouteAccess(ROUTE);
  return <NewUserScreen />;
}
