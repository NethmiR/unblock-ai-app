import { cn } from "@/lib/utils/cn";
import type { ReactNode } from "react";

const PLACEHOLDER_NODES = [0, 1, 2] as const;

export function FlowchartPlaceholder({ pulse = false, children }: { pulse?: boolean; children?: ReactNode }) {
  return (
    <div
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-[18px] bg-[repeating-linear-gradient(135deg,rgba(71,85,105,.035)_0_8px,transparent_8px_16px)] px-6",
        pulse && "animate-pulse",
      )}
    >
      <div aria-hidden="true" className="flex flex-col items-center gap-[9px] opacity-55">
        {PLACEHOLDER_NODES.map((index) => (
          <div key={index} className="contents">
            <div className="h-[34px] w-[132px] rounded-[9px] border border-dashed border-line-admin" />
            {index < PLACEHOLDER_NODES.length - 1 && <div className="h-4 w-px bg-line-admin" />}
          </div>
        ))}
      </div>
      {children}
    </div>
  );
}
