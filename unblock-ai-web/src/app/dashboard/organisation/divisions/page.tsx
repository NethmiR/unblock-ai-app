import { DivisionsScreen } from "@/components/organisation/divisions/DivisionsScreen";
import { requireRouteAccess } from "@/lib/auth/session";
import { dashboardPageMetadata } from "@/lib/navigation/page-metadata";
import { RoutePath } from "@/lib/routing/route-path";

const ROUTE = RoutePath.ORGANISATION_DIVISIONS;

export const metadata = dashboardPageMetadata(ROUTE);

export default async function OrganisationDivisionsPage() {
  await requireRouteAccess(ROUTE);
  return <DivisionsScreen />;
}
