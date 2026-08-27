import { redirect } from "next/navigation";
import { getRequesterContext, getSession } from "@/lib/auth/session";
import { NewRequestFlow } from "@/components/portal/NewRequestFlow";

export const dynamic = "force-dynamic";

/**
 * Server Component so it can read the session cookie and pass the requester
 * context down as a prop - `useSelectionSession` runs in a Client Component
 * and cannot call `getSession()` itself. See Finding 0.4 in
 * docs/auth-and-deletion-tracking-phase-plan.md.
 *
 * `proxy.ts` already guards `/portal/:path*`, so a missing session here means
 * the cookie expired between the guard check and this render - the redirect
 * is a defensive fallback, not the primary gate.
 */
export default async function NewJobPage() {
  const session = await getSession();
  if (!session) redirect("/portal/login?next=/portal/jobs/new");

  return <NewRequestFlow requesterContext={getRequesterContext(session)} />;
}
