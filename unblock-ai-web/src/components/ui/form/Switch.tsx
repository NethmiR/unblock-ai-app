"use client";
import { useId } from "react";
import { cn } from "@/lib/utils/cn";

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}

export function Switch({ checked, onCheckedChange, label, description, disabled = false }: SwitchProps) {
  const labelId = useId();
  const descriptionId = useId();

  return (
    <div className="flex items-start justify-between gap-4 rounded-control border border-line-admin px-3.5 py-3">
      <div className="min-w-0">
        <span id={labelId} className="block text-[13.5px] font-medium text-ink">
          {label}
        </span>
        {description && (
          <span id={descriptionId} className="mt-0.5 block text-[12px] leading-relaxed text-muted">
            {description}
          </span>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={description ? descriptionId : undefined}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "relative mt-0.5 h-6 w-11 flex-none cursor-pointer rounded-pill transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-60",
          checked ? "bg-accent" : "bg-slate-300",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-[22px]" : "translate-x-0.5",
          )}
        />
      </button>
    </div>
  );
}
