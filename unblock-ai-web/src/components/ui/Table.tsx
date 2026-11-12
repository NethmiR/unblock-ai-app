import { cn } from "@/lib/utils/cn";
import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

type ColumnTemplateStyle = CSSProperties & { "--table-columns": string };

interface TableProps {
  columns: string;
  label: string;
  children: ReactNode;
  className?: string;
}

export function Table({ columns, label, children, className }: TableProps) {
  const style: ColumnTemplateStyle = { "--table-columns": columns };
  return (
    <div role="table" aria-label={label} style={style} className={cn("overflow-hidden rounded-card border border-line-admin", className)}>
      {children}
    </div>
  );
}

const GRID_LAYOUT = "sm:grid sm:items-center sm:gap-4 sm:[grid-template-columns:var(--table-columns)]";
const ROW_LAYOUT = cn("flex flex-col gap-1.5", GRID_LAYOUT);

export function TableHeader({ children }: { children: ReactNode }) {
  return (
    <div role="row" className={cn("hidden border-b border-line-admin bg-bg px-4 py-2.5", GRID_LAYOUT)}>
      {children}
    </div>
  );
}

export function TableHeaderCell({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <div role="columnheader" className={cn("text-[11.5px] font-semibold uppercase tracking-wider text-faint", className)}>
      {children}
    </div>
  );
}

interface TableRowProps extends HTMLAttributes<HTMLDivElement> {
  highlighted?: boolean;
  muted?: boolean;
}

export function TableRow({ highlighted = false, muted = false, className, children, ...props }: TableRowProps) {
  return (
    <div
      role="row"
      {...props}
      className={cn(
        ROW_LAYOUT,
        "border-b border-line-admin px-4 py-3.5 transition-colors last:border-b-0",
        highlighted && "bg-accent/5",
        muted && "bg-bg/60",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function TableCell({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <div role="cell" className={cn("min-w-0 text-[13.5px] text-ink", className)}>
      {children}
    </div>
  );
}
