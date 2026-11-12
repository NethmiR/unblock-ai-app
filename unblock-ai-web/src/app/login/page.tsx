import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/LoginForm";
import { BrandMark } from "@/components/ui/BrandMark";
import { APP_CONFIG } from "@/lib/config/app.config";
import { getSession } from "@/lib/auth/session";
import { RoutePath } from "@/lib/routing/route-path";

export default async function LoginPage() {
  if (await getSession()) redirect(RoutePath.DASHBOARD);

  return (
    <div className="font-admin flex min-h-screen items-center justify-center bg-bg px-6">
      <div className="w-full max-w-[380px] rounded-card border border-line-admin bg-surface p-8 shadow-sm">
        <div className="mb-6 text-center">
          <BrandMark size="md" className="mx-auto mb-3" />
          <h1 className="text-lg font-bold tracking-tight">{APP_CONFIG.name}</h1>
          <p className="mt-1 text-[13px] text-muted">Sign in to continue</p>
        </div>

        <LoginForm />
      </div>
    </div>
  );
}
