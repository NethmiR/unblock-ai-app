import { cn } from "@/lib/utils/cn";
import { controlClassName } from "./control-style";
import type { SelectHTMLAttributes } from "react";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

interface SelectProps<T extends string> extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange"> {
  value: T;
  options: readonly SelectOption<T>[];
  onValueChange: (value: T) => void;
  invalid?: boolean;
}

export function Select<T extends string>({ value, options, onValueChange, invalid = false, className, ...props }: SelectProps<T>) {
  return (
    <select
      {...props}
      value={value}
      onChange={(event) => {
        const selected = options.find((option) => option.value === event.target.value);
        if (selected) onValueChange(selected.value);
      }}
      className={controlClassName(invalid, cn("h-10 cursor-pointer pr-9", className))}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
