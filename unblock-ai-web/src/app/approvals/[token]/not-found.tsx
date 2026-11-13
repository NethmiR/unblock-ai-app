import { ApprovalLinkUnavailable, ApprovalLinkUnavailableReason } from "@/components/approvals/ApprovalLinkUnavailable";

/**
 * Reached for a malformed or unknown token, or a cancelled request. There is
 * no login for an approver, so this must never say "session expired, please log in".
 */
export default function ApprovalNotFound() {
  return <ApprovalLinkUnavailable reason={ApprovalLinkUnavailableReason.INVALID} />;
}
