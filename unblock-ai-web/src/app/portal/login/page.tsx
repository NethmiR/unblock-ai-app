import Link from "next/link";
import { LoginForm } from "@/components/auth/LoginForm";

export default function PortalLoginPage() {
  return (
    <div className="font-portal flex min-h-screen items-center justify-center bg-bg px-6">
      <div className="w-full max-w-[380px] rounded-card border border-line bg-surface p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-ink text-sm font-bold text-white">
            U
          </div>
          <h1 className="text-lg font-semibold tracking-tight">Unblock AI</h1>
          <p className="mt-1 text-[13px] text-muted">Sign in to submit and track requests</p>
        </div>

        <LoginForm audience="portal" defaultRedirect="/portal" />

        <p className="mt-6 text-center text-[12px] text-faint">
          Administrator?{" "}
          <Link href="/login" className="text-accent hover:underline">
            Sign in here
          </Link>
        </p>
      </div>
    </div>
  );
}
