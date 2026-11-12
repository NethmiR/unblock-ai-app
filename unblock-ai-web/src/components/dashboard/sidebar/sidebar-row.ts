import { cn } from "@/lib/utils/cn";

interface SidebarRowState {
  /** The row IS the current page. */
  isActive?: boolean;
  /** The row CONTAINS the current page (an expandable group header). */
  isEmphasized?: boolean;
}

/** One shared look for every clickable sidebar row: links, group headers, sign-out. */
export function sidebarRowClass({ isActive = false, isEmphasized = false }: SidebarRowState = {}): string {
  return cn(
    "flex w-full cursor-pointer items-center gap-3 rounded-control px-3 py-2 text-left text-[13.5px] transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
    "disabled:cursor-not-allowed disabled:text-faint",
    isActive ? "bg-accent/10 font-semibold text-accent" : "text-muted hover:bg-bg hover:text-ink",
    isEmphasized && !isActive && "font-semibold text-ink",
  );
}
