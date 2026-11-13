import { useId } from "react";
import { cn } from "@/lib/utils/cn";

type AssistantMarkSize = "sm" | "lg";

const SIZES: Record<AssistantMarkSize, string> = {
  sm: "h-7 w-7",
  lg: "h-14 w-14",
};

const LARGE_SPARKLE =
  "M9.8 15.9 9 18.75l-.8-2.85a4.5 4.5 0 0 0-3.1-3.09L2.25 12l2.85-.81a4.5 4.5 0 0 0 3.1-3.09L9 5.25l.8 2.85a4.5 4.5 0 0 0 3.1 3.09l2.85.81-2.85.81a4.5 4.5 0 0 0-3.1 3.09z";
const SMALL_SPARKLE =
  "M18.26 8.72 18 9.75l-.26-1.03a3.38 3.38 0 0 0-2.45-2.46L14.25 6l1.04-.26a3.38 3.38 0 0 0 2.45-2.46L18 2.25l.26 1.03a3.38 3.38 0 0 0 2.46 2.46L21.75 6l-1.03.26a3.38 3.38 0 0 0-2.46 2.46z";

export function AssistantMark({ size = "sm", className }: { size?: AssistantMarkSize; className?: string }) {
  const gradientId = useId();
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={cn("flex-none", SIZES[size], className)}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--assistant-from)" />
          <stop offset="100%" stopColor="var(--assistant-to)" />
        </linearGradient>
      </defs>
      <path d={LARGE_SPARKLE} fill={`url(#${gradientId})`} />
      <path d={SMALL_SPARKLE} fill={`url(#${gradientId})`} />
    </svg>
  );
}
