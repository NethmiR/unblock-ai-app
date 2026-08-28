import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { SignOutButton } from "@/components/auth/SignOutButton";

/**
 * Requester-side counterpart to the admin `TopBar` - same 60px sticky shell so
 * the two portals read as one product, but it links the requester's own routes
 * and signs out to `/portal/login`.
 *
 * Renders nothing when there is no session: `/portal/login` sits inside this
 * layout, and a nav bar naming a signed-out user has nothing to show.
 */
export async function PortalTopBar() {
  const session = await getSession();
  if (!session) return null;

  return (
    <header className="sticky top-0 z-20 flex h-[60px] items-center justify-between border-b border-line bg-surface px-8">
      <div className="flex items-center gap-3.5">
        <Link href="/portal" className="flex items-center gap-3.5">
          <div className="flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-ink text-xs font-bold text-white">
            U
          </div>
          <div className="text-[15.5px] font-bold tracking-tight">Unblock AI</div>
        </Link>
        <div className="h-5 w-px bg-line" />
        <div className="text-[12.5px] text-muted">Requester portal</div>
        <nav className="ml-2 flex items-center gap-4 text-[12.5px]">
          <Link href="/portal" className="text-muted hover:text-ink">
            My Requests
          </Link>
          <Link href="/portal/jobs/new" className="text-muted hover:text-ink">
            New Request
          </Link>
        </nav>
      </div>

      <div className="flex items-center gap-[18px]">
        <div className="text-[12.5px] text-muted">{session.user.organisation ?? ""}</div>
        <div className="flex items-center gap-2.5 rounded-full border border-line py-[5px] pl-1.5 pr-2.5">
          <div className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-white">
            {session.initials}
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-[12.5px] font-semibold">{session.user.full_name}</span>
            <span className="text-[10.5px] text-muted">{session.user.department ?? ""}</span>
          </div>
        </div>
        <SignOutButton redirectTo="/portal/login" />
      </div>
    </header>
  );
}
