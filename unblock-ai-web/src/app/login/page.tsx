import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/LoginForm";
import { getSession } from "@/lib/auth/session";
import { RoutePath } from "@/lib/routing/route-path";

export default async function LoginPage() {
  if (await getSession()) redirect(RoutePath.ACCOUNT);

  return (
    <div className="font-admin flex min-h-screen items-center justify-center bg-bg px-6">
      <div className="w-full max-w-[380px] rounded-card border border-line-admin bg-surface p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-ink text-sm font-bold text-white">
            U
          </div>
          <h1 className="text-lg font-bold tracking-tight">Unblock AI</h1>
          <p className="mt-1 text-[13px] text-muted">Sign in to continue</p>
        </div>

        <LoginForm />
      </div>
    </div>
  );
}
