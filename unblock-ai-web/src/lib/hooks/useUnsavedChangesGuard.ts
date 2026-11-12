"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export interface UnsavedChangesGuard {
  pendingHref: string | null;
  confirmLeave: () => void;
  stay: () => void;
}

function sameOriginHref(target: EventTarget | null): string | null {
  const anchor = target instanceof Element ? target.closest("a[href]") : null;
  if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.hasAttribute("download")) return null;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return null;
  const href = `${url.pathname}${url.search}${url.hash}`;
  return href === `${window.location.pathname}${window.location.search}${window.location.hash}` ? null : href;
}

export function useUnsavedChangesGuard(isDirty: boolean): UnsavedChangesGuard {
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    if (!isDirty) return;

    const warnBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    const interceptNavigation = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const href = sameOriginHref(event.target);
      if (href === null) return;
      event.preventDefault();
      event.stopPropagation();
      setPendingHref(href);
    };

    window.addEventListener("beforeunload", warnBeforeUnload);
    document.addEventListener("click", interceptNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", warnBeforeUnload);
      document.removeEventListener("click", interceptNavigation, true);
    };
  }, [isDirty]);

  const confirmLeave = useCallback(() => {
    if (pendingHref === null) return;
    setPendingHref(null);
    router.push(pendingHref);
  }, [pendingHref, router]);

  const stay = useCallback(() => setPendingHref(null), []);

  return { pendingHref, confirmLeave, stay };
}
