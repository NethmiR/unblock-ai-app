import type { ReactNode } from "react";

/**
 * Deliberately no nav shell: the approver holds a token, not a session, and
 * must not be shown navigation implying an account. See the comment atop
 * approvals/[token]/page.tsx.
 */
export default function ApprovalsLayout({ children }: { children: ReactNode }) {
  return <div className="font-portal min-h-screen">{children}</div>;
}
