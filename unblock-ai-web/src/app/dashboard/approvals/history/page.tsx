import { ApprovalHistoryScreen } from "@/components/approvals/inbox/ApprovalHistoryScreen";
import { requireRouteAccess } from "@/lib/auth/session";
import { dashboardPageMetadata } from "@/lib/navigation/page-metadata";
import { RoutePath } from "@/lib/routing/route-path";

const ROUTE = RoutePath.APPROVALS_HISTORY;

export const metadata = dashboardPageMetadata(ROUTE);

export default async function ApprovalHistoryPage() {
  await requireRouteAccess(ROUTE);
  return <ApprovalHistoryScreen />;
}
