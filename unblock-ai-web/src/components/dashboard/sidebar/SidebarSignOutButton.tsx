"use client";
import { Icon } from "@/components/ui/icons/Icon";
import { AUTH_COPY } from "@/lib/constants/ui-copy";
import { useSignOut } from "@/lib/hooks/useSignOut";
import { IconName } from "@/types/icon";
import { sidebarRowClass } from "./sidebar-row";

export function SidebarSignOutButton() {
  const { signOut, isSigningOut } = useSignOut();

  return (
    <button type="button" onClick={signOut} disabled={isSigningOut} className={sidebarRowClass()}>
      <Icon name={IconName.SIGN_OUT} className="h-[18px] w-[18px]" />
      <span>{isSigningOut ? AUTH_COPY.signingOut : AUTH_COPY.signOut}</span>
    </button>
  );
}
