import { EmptyState } from "@/components/ui/EmptyState";

/**
 * Reached for a malformed, unknown, or expired token - all 404, deliberately
 * not 401. There is no login for an approver, so this must never say
 * "session expired, please log in".
 */
export default function ApprovalNotFound() {
  return (
    <div className="mx-auto flex min-h-screen max-w-[640px] items-center px-6">
      <EmptyState
        title="This link is no longer valid"
        body="The approval link may have expired or already been used, or the address may be incorrect. Contact the person who sent you this request if you believe this is a mistake."
      />
    </div>
  );
}
