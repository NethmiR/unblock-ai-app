import { notFound } from "next/navigation";
import { approvalsApi } from "@/lib/api/approvals";
import { ApiError } from "@/lib/api/client";
import { ApproverView } from "@/components/approvals/ApproverView";
import { ApprovalLinkUnavailable, ApprovalLinkUnavailableReason } from "@/components/approvals/ApprovalLinkUnavailable";
import { HTTP_STATUS_GONE, HTTP_STATUS_NOT_FOUND } from "@/lib/api/http-status";
import type { ApproverViewDto } from "@/types/approval";

export const dynamic = "force-dynamic";

/**
 * Deliberately outside the dashboard. The approver holds a token from an
 * email, not a session - this route must not inherit a nav shell that implies
 * an account they do not have.
 */
export default async function ApprovalPage({ params }: PageProps<"/approvals/[token]">) {
  const { token } = await params;

  let view: ApproverViewDto;
  try {
    view = await approvalsApi.getView(token);
  } catch (err: unknown) {
    if (err instanceof ApiError && err.status === HTTP_STATUS_GONE) {
      return <ApprovalLinkUnavailable reason={ApprovalLinkUnavailableReason.EXPIRED} />;
    }
    if (err instanceof ApiError && err.status === HTTP_STATUS_NOT_FOUND) notFound();
    throw err;
  }
  return <ApproverView token={token} view={view} />;
}
