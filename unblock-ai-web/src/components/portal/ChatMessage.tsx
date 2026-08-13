import { Spinner } from "@/components/ui/Spinner";
import type { ChatMessage as Message } from "@/lib/hooks/useSelectionSession";

interface Props {
  message: Message;
  onOptionClick?: (option: string) => void;
  disabled?: boolean;
}

export function ChatMessage({ message, onOptionClick, disabled }: Props) {
  if (message.role === "user") {
    return (
      <div className="max-w-[82%] self-end rounded-card bg-ink px-[15px] py-3 text-[14.5px] leading-normal text-white">
        {message.text}
      </div>
    );
  }

  if (message.role === "waiting") {
    return (
      <div className="flex max-w-[88%] items-center gap-[11px] self-start rounded-card border border-warn-border bg-warn-bg px-4 py-3">
        <Spinner size={18} />
        <div className="text-[14.5px] font-medium">{message.text}</div>
      </div>
    );
  }

  return (
    <div className="max-w-[88%] self-start">
      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[.12em] text-muted">
        Unblock AI
      </div>
      <div className="rounded-card border border-line bg-bg px-[15px] py-[13px] text-[14.5px] leading-relaxed">
        {message.text}
      </div>

      {/* Quick replies. Typing "IT" and clicking "Information Technology"
          must produce the same result - both call `send`. */}
      {message.options && message.options.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {message.options.map((option) => (
            <button
              key={option}
              disabled={disabled}
              onClick={() => onOptionClick?.(option)}
              className="rounded-full border border-line bg-surface px-3.5 py-2 text-[13.5px] text-ink transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
