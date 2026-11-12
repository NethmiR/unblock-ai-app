"use client";
import { useId } from "react";
import { cn } from "@/lib/utils/cn";

interface CheckboxProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}

export function Checkbox({ checked, onCheckedChange, label, description, disabled = false, className }: CheckboxProps) {
  const id = useId();

  return (
    <label
      htmlFor={id}
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-control border px-3.5 py-3 transition-colors",
        checked ? "border-accent/40 bg-accent/5" : "border-line-admin bg-surface hover:bg-bg",
        disabled && "cursor-not-allowed opacity-60",
        className,
      )}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onCheckedChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 flex-none cursor-pointer accent-accent"
      />
      <span className="min-w-0">
        <span className="block text-[13.5px] font-medium text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-[12px] leading-relaxed text-muted">{description}</span>}
      </span>
    </label>
  );
}
