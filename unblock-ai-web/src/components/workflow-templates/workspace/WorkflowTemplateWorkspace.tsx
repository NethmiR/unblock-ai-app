import type { ReactNode } from "react";

export function WorkflowTemplateWorkspace({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">{children}</div>;
}
