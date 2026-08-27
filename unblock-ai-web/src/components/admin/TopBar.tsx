import { getSession } from "@/lib/auth/session";
import { SignOutButton } from "./SignOutButton";

export async function TopBar() {
  const session = await getSession();

  return (
    <header className="sticky top-0 z-20 flex h-[60px] items-center justify-between border-b border-line-admin bg-surface px-8">
      <div className="flex items-center gap-3.5">
        <div className="flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-ink text-xs font-bold text-white">
          U
        </div>
        <div className="text-[15.5px] font-bold tracking-tight">Unblock AI</div>
        <div className="h-5 w-px bg-line-admin" />
        <div className="text-[12.5px] text-muted">Workflow administration</div>
      </div>

      <div className="flex items-center gap-[18px]">
        <div className="text-[12.5px] text-muted">{session?.user.organisation ?? ""}</div>
        <div className="flex items-center gap-2.5 rounded-full border border-line-admin py-[5px] pl-1.5 pr-2.5">
          <div className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-white">
            {session?.initials ?? "?"}
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-[12.5px] font-semibold">{session?.user.full_name ?? "Signed out"}</span>
            <span className="text-[10.5px] text-muted">{session?.user.department ?? ""} · Admin</span>
          </div>
        </div>
        <SignOutButton />
      </div>
    </header>
  );
}
