import { useId, type ReactNode } from "react";

interface SidebarSectionProps {
  label: string;
  /** `<li>` elements. */
  children: ReactNode;
}

export function SidebarSection({ label, children }: SidebarSectionProps) {
  const labelId = useId();

  return (
    <div className="mb-6 last:mb-0">
      <p id={labelId} className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-faint">
        {label}
      </p>
      <ul aria-labelledby={labelId} className="flex flex-col gap-0.5">
        {children}
      </ul>
    </div>
  );
}
