"use client";
import { Checkbox } from "./Checkbox";
import { cn } from "@/lib/utils/cn";

export interface CheckboxGroupOption<T extends string> {
  value: T;
  label: string;
  description?: string;
}

interface CheckboxGroupProps<T extends string> {
  legend: string;
  options: readonly CheckboxGroupOption<T>[];
  values: readonly T[];
  onValuesChange: (values: T[]) => void;
  error?: string | null;
  columns?: 1 | 2 | 3;
  disabled?: boolean;
}

const COLUMN_CLASSES: Record<NonNullable<CheckboxGroupProps<string>["columns"]>, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-3",
};

export function CheckboxGroup<T extends string>({
  legend,
  options,
  values,
  onValuesChange,
  error,
  columns = 1,
  disabled = false,
}: CheckboxGroupProps<T>) {
  const toggle = (value: T, checked: boolean) => {
    if (!checked) {
      onValuesChange(values.filter((candidate) => candidate !== value));
      return;
    }
    onValuesChange(
      options.map((option) => option.value).filter((candidate) => candidate === value || values.includes(candidate)),
    );
  };

  return (
    <fieldset className="flex flex-col gap-2" aria-invalid={error ? true : undefined}>
      <legend className="mb-1.5 text-[12.5px] font-semibold text-ink">{legend}</legend>
      <div className={cn("grid gap-2", COLUMN_CLASSES[columns])}>
        {options.map((option) => (
          <Checkbox
            key={option.value}
            label={option.label}
            description={option.description}
            checked={values.includes(option.value)}
            disabled={disabled}
            onCheckedChange={(checked) => toggle(option.value, checked)}
          />
        ))}
      </div>
      {error && (
        <p role="alert" className="text-[12px] text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}
