import { FacultiesScreen } from "@/components/organisation/faculties/FacultiesScreen";
import { requireRouteAccess } from "@/lib/auth/session";
import { dashboardPageMetadata } from "@/lib/navigation/page-metadata";
import { RoutePath } from "@/lib/routing/route-path";

const ROUTE = RoutePath.ORGANISATION_FACULTIES;

export const metadata = dashboardPageMetadata(ROUTE);

export default async function OrganisationFacultiesPage() {
  await requireRouteAccess(ROUTE);
  return <FacultiesScreen />;
}
