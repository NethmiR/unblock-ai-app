"use client";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/icons/Icon";
import { UI_COPY } from "@/lib/constants/ui-copy";
import { cn } from "@/lib/utils/cn";
import { IconName } from "@/types/icon";

enum ToastTone {
  SUCCESS = "success",
  ERROR = "error",
}

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
}

const TOAST_DURATION_MS = 4000;

const TONE_STYLES: Record<ToastTone, { container: string; icon: IconName }> = {
  [ToastTone.SUCCESS]: { container: "border-success/30 text-ink", icon: IconName.CHECK },
  [ToastTone.ERROR]: { container: "border-danger/30 text-danger", icon: IconName.CLOSE },
};

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((current) => current.filter((toast) => toast.id !== id)), []);

  const show = useCallback(
    (tone: ToastTone, message: string) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, tone, message }]);
      window.setTimeout(() => dismiss(id), TOAST_DURATION_MS);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({ success: (message) => show(ToastTone.SUCCESS, message), error: (message) => show(ToastTone.ERROR, message) }),
    [show],
  );

  return (
    <ToastContext value={api}>
      {children}
      <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-3 bottom-4 z-50 flex flex-col items-end gap-2 sm:inset-x-auto sm:right-6">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-card border bg-surface px-4 py-3 text-[13.5px] shadow-lg",
              TONE_STYLES[toast.tone].container,
            )}
          >
            <Icon name={TONE_STYLES[toast.tone].icon} className="mt-px h-4 w-4" />
            <span className="min-w-0 flex-1">{toast.message}</span>
            <button
              type="button"
              aria-label={UI_COPY.dismiss}
              onClick={() => dismiss(toast.id)}
              className="cursor-pointer rounded-control p-0.5 text-faint hover:text-ink"
            >
              <Icon name={IconName.CLOSE} className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext>
  );
}

export function useToast(): ToastApi {
  const toast = useContext(ToastContext);
  if (!toast) throw new Error("useToast must be used within a ToastProvider");
  return toast;
}
