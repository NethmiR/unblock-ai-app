import { AssistantMark } from "./AssistantMark";
import { TASK_REQUEST_COPY } from "@/lib/task-request/task-request-copy";

const DOT_DELAYS_MS = [0, 160, 320] as const;

export function AssistantTypingIndicator() {
  return (
    <div className="flex items-center gap-3">
      <AssistantMark />
      <div role="status" aria-label={TASK_REQUEST_COPY.assistant.thinking} className="flex items-center gap-1.5 rounded-pill bg-bg px-3.5 py-2.5">
        {DOT_DELAYS_MS.map((delay) => (
          <span key={delay} aria-hidden="true" className="animate-ub-typing h-1.5 w-1.5 rounded-full bg-muted" style={{ animationDelay: `${delay}ms` }} />
        ))}
      </div>
    </div>
  );
}
