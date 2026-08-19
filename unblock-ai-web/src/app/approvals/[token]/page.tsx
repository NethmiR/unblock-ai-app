import { notFound } from "next/navigation";
import { approvalsApi } from "@/lib/api/approvals";
import { ApiError } from "@/lib/api/client";
import { ApproverView } from "@/components/approvals/ApproverView";

export const dynamic = "force-dynamic";

/**
 * Deliberately outside /portal and /admin. The approver holds a token from an
 * email, not a session - this route must not inherit a nav shell that implies
 * an account they do not have.
 */
export default async function ApprovalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let view;
  try {
    view = await approvalsApi.getView(token);
  } catch (err) {
    // 404 for both a malformed and an unrecognised/expired token - the API
    // deliberately does not distinguish, so neither does this page.
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  return <ApproverView token={token} initialView={view} />;
}
