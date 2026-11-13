"use client";
import { Avatar } from "@/components/ui/Avatar";
import { useSession } from "@/components/providers/SessionProvider";
import { TASK_REQUEST_COPY } from "@/lib/task-request/task-request-copy";
import { cn } from "@/lib/utils/cn";

export function RequesterMessageBubble({ text, pending = false }: { text: string; pending?: boolean }) {
  const { initials } = useSession();
  return (
    <div className="flex items-start justify-end gap-3">
      <p className="sr-only">{TASK_REQUEST_COPY.assistant.you}</p>
      <div
        className={cn(
          "max-w-[min(560px,85%)] whitespace-pre-wrap rounded-card bg-accent/10 px-4 py-2.5 text-[14px] leading-relaxed text-ink",
          pending && "opacity-70",
        )}
      >
        {text}
      </div>
      <Avatar initials={initials} size="sm" className="mt-0.5" />
    </div>
  );
}
