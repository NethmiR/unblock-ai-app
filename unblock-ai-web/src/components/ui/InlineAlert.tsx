import { Button } from "@/components/ui/Button";
import { UI_COPY } from "@/lib/constants/ui-copy";
import { cn } from "@/lib/utils/cn";
import type { ReactNode } from "react";

interface InlineAlertProps {
  children: ReactNode;
  onRetry?: () => void;
  className?: string;
}

export function InlineAlert({ children, onRetry, className }: InlineAlertProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col gap-3 rounded-card border border-danger/20 bg-danger/5 px-4 py-3 text-[13px] text-danger sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">{children}</div>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry} className="flex-none">
          {UI_COPY.retry}
        </Button>
      )}
    </div>
  );
}
