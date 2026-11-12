import { cn } from "@/lib/utils/cn";

export function CodeChip({ code, className }: { code: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex flex-none items-center rounded-[6px] border border-line-admin bg-bg px-1.5 py-px font-mono text-[11px] font-medium text-muted",
        className,
      )}
    >
      {code}
    </span>
  );
}
