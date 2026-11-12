import { cn } from "@/lib/utils/cn";
import type { ReactNode } from "react";

type NoticeTone = "info" | "warn";

const TONES: Record<NoticeTone, string> = {
  info: "border-accent/20 bg-accent/5 text-ink",
  warn: "border-warn-border bg-warn-bg text-warn-ink",
};

interface NoticeProps {
  tone?: NoticeTone;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function Notice({ tone = "info", action, className, children }: NoticeProps) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col gap-3 rounded-card border px-4 py-3 text-[13px] leading-relaxed sm:flex-row sm:items-center sm:justify-between",
        TONES[tone],
        className,
      )}
    >
      <div className="min-w-0">{children}</div>
      {action && <div className="flex-none">{action}</div>}
    </div>
  );
}
