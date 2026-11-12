"use client";
import { useEffect, useId, useRef, type FormEvent, type ReactNode } from "react";
import { Icon } from "@/components/ui/icons/Icon";
import { UI_COPY } from "@/lib/constants/ui-copy";
import { IconName } from "@/types/icon";

interface DrawerProps {
  title: string;
  description?: string;
  busy?: boolean;
  onClose: () => void;
  onSubmit?: () => void;
  footer?: ReactNode;
  children: ReactNode;
}

export function Drawer({ title, description, busy = false, onClose, onSubmit, footer, children }: DrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closingRef = useRef(false);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => {
      closingRef.current = true;
      dialog.close();
    };
  }, []);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!busy) onSubmit?.();
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClose={() => {
        if (!busy && !closingRef.current) onClose();
      }}
      className="fixed inset-y-0 right-0 left-auto m-0 h-full max-h-none w-full max-w-full border-l border-line-admin bg-surface p-0 shadow-2xl backdrop:bg-ink/40 sm:w-[480px]"
    >
      <form onSubmit={handleSubmit} noValidate className="flex h-full flex-col">
        <header className="flex flex-none items-start justify-between gap-4 border-b border-line-admin px-6 py-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[16px] font-bold tracking-tight text-ink">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-1 text-[12.5px] leading-relaxed text-muted">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label={UI_COPY.close}
            className="cursor-pointer rounded-control p-1.5 text-muted hover:bg-bg hover:text-ink disabled:cursor-not-allowed"
          >
            <Icon name={IconName.CLOSE} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <footer className="flex flex-none justify-end gap-3 border-t border-line-admin bg-bg/60 px-6 py-4">{footer}</footer>}
      </form>
    </dialog>
  );
}
