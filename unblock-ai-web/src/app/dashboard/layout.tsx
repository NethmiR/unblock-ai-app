import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { ToastProvider } from "@/components/providers/ToastProvider";
import { requireSession } from "@/lib/auth/session";

/**
 * Resolves the signed-in user once on the server and shares it with every
 * Client Component below through `SessionProvider` (`useSession()`).
 *
 * This only feeds the UI - it is NOT the access check. Each page still calls
 * `requireRouteAccess(...)`, because a layout does not stop its child
 * segments from rendering.
 */
export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const session = await requireSession();

  return (
    <SessionProvider session={session}>
      <ToastProvider>
        <DashboardShell>{children}</DashboardShell>
      </ToastProvider>
    </SessionProvider>
  );
}
