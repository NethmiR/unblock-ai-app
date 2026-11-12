import { redirect } from "next/navigation";
import { getRequesterContext, getSession } from "@/lib/auth/session";
import { loginPathFor } from "@/lib/routing/route-path";
import { NewRequestFlow } from "@/components/portal/NewRequestFlow";

export const dynamic = "force-dynamic";

export default async function NewJobPage() {
  const session = await getSession();
  if (!session) redirect(loginPathFor("/old/portal/jobs/new"));

  return <NewRequestFlow requesterContext={getRequesterContext()} />;
}
