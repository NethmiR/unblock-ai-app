"use client";
import { useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils/cn";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({ label, options, value, onValueChange }: SegmentedControlProps<T>) {
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const current = options.findIndex((option) => option.value === value);
    const next = (current + (event.key === "ArrowRight" ? 1 : -1) + options.length) % options.length;
    onValueChange(options[next].value);
    buttonRefs.current[next]?.focus();
  }

  return (
    <div role="radiogroup" aria-label={label} onKeyDown={handleKeyDown} className="inline-flex rounded-control border border-line-admin bg-bg p-0.5">
      {options.map((option, index) => {
        const isSelected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(element) => {
              buttonRefs.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={isSelected}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onValueChange(option.value)}
            className={cn(
              "h-8 cursor-pointer rounded-[8px] px-3 text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
              isSelected ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
