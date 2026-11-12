import { cn } from "@/lib/utils/cn";

export function controlClassName(invalid: boolean, className?: string): string {
  return cn(
    "w-full rounded-control border bg-surface px-3.5 text-[13.5px] text-ink transition-colors",
    "placeholder:text-faint focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-bg disabled:text-muted",
    invalid ? "border-danger focus:ring-danger/25" : "border-line-admin focus:ring-accent/30",
    className,
  );
}
