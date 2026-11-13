import { Notice } from "@/components/ui/Notice";
import { TASK_REQUEST_COPY } from "@/lib/task-request/task-request-copy";
import type { UnsupportedTaskInput } from "@/types/task";

export function TaskUnsupportedInputsNotice({ inputs }: { inputs: readonly UnsupportedTaskInput[] }) {
  if (inputs.length === 0) return null;
  return (
    <Notice tone="warn">
      <p>{TASK_REQUEST_COPY.workspace.unsupportedInputs}</p>
      <ul className="mt-1 list-disc pl-5">
        {inputs.map((input) => (
          <li key={input.input_id}>{input.label}</li>
        ))}
      </ul>
    </Notice>
  );
}
