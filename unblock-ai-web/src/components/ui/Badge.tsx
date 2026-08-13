import { cn } from "@/lib/utils/cn";
import type { HTMLAttributes, ReactNode } from "react";

type Tone = "neutral" | "warn" | "success" | "danger";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  children: ReactNode;
}

/** Tone styles as data - a new status color is one line, not a new component. */
const TONES: Record<Tone, string> = {
  neutral: "bg-bg text-muted border border-line-admin",
  warn: "bg-warn-bg text-warn-ink border border-warn-border",
  success: "bg-success/10 text-success border border-success/20",
  danger: "bg-danger/10 text-danger border border-danger/20",
};

export function Badge({ tone = "neutral", className, children, ...props }: BadgeProps) {
  return (
    <span
      {...props}
      className={cn(
        "inline-flex items-center rounded-pill px-2.5 py-0.5 text-[12px] font-semibold",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
