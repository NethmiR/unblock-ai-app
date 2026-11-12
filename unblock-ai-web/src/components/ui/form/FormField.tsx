"use client";
import { useId, type ReactNode } from "react";
import { UI_COPY } from "@/lib/constants/ui-copy";
import { cn } from "@/lib/utils/cn";

export interface FieldControlProps {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  required?: boolean;
}

interface FormFieldProps {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  className?: string;
  children: (control: FieldControlProps) => ReactNode;
}

export function FormField({ label, hint, error, required = false, className, children }: FormFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-[12.5px] font-semibold text-ink">
        {label}
        {required && (
          <span className="ml-0.5 text-danger" aria-hidden="true" title={UI_COPY.required}>
            *
          </span>
        )}
      </label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined, required })}
      {hint && !error && (
        <p id={hintId} className="text-[12px] leading-relaxed text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-[12px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
