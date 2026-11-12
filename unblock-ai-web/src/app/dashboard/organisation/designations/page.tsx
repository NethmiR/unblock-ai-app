import { DesignationsScreen } from "@/components/organisation/designations/DesignationsScreen";
import { requireRouteAccess } from "@/lib/auth/session";
import { dashboardPageMetadata } from "@/lib/navigation/page-metadata";
import { RoutePath } from "@/lib/routing/route-path";

const ROUTE = RoutePath.ORGANISATION_DESIGNATIONS;

export const metadata = dashboardPageMetadata(ROUTE);

export default async function OrganisationDesignationsPage() {
  await requireRouteAccess(ROUTE);
  return <DesignationsScreen />;
}
