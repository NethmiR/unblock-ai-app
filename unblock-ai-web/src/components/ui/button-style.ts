import { cn } from "@/lib/utils/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

/** Variant styles as data, not as an if/else chain. Adding one is one line. */
const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-white shadow-sm hover:bg-accent-hover disabled:bg-slate-200 disabled:text-muted disabled:shadow-none",
  secondary: "bg-surface text-ink border border-line-admin hover:bg-bg disabled:text-faint",
  ghost: "bg-transparent text-muted hover:text-ink disabled:text-faint",
  danger: "bg-danger text-white shadow-sm hover:bg-danger/90 disabled:bg-slate-200 disabled:text-muted disabled:shadow-none",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-[13px]",
  md: "h-10 px-5 text-[13.5px]",
};

export function buttonClassName(variant: ButtonVariant, size: ButtonSize, className?: string): string {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-control font-semibold transition-colors",
    "cursor-pointer disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}
