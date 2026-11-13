/**
 * Deliberately no nav shell: the approver holds a token, not a session, and
 * must not be shown navigation implying an account. See the comment atop
 * approvals/[token]/page.tsx.
 */
export default function ApprovalsLayout({ children }: LayoutProps<"/approvals">) {
  return <div className="font-admin min-h-screen bg-bg">{children}</div>;
}
