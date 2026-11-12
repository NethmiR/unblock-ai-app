import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { resolveLandingRoute } from "@/lib/navigation/navigation-access";

/** `/dashboard` has no content of its own: send the user to the first page they can use. */
export default async function DashboardIndexPage() {
  const session = await requireSession();
  redirect(resolveLandingRoute(session.user.permissions));
}
