"use client";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "@/components/ui/icons/Icon";
import { UI_COPY } from "@/lib/constants/ui-copy";
import { cn } from "@/lib/utils/cn";
import { IconName } from "@/types/icon";
import { MenuItemTone, type MenuItem } from "@/types/menu";

interface MenuProps {
  items: readonly MenuItem[];
  label?: string;
}

export function Menu({ items, label = UI_COPY.moreActions }: MenuProps) {
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    itemRefs.current.find((item) => item && !item.disabled)?.focus();
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [isOpen]);

  function close(): void {
    setIsOpen(false);
    triggerRef.current?.focus();
  }

  function focusSibling(direction: 1 | -1): void {
    const enabled = itemRefs.current.filter((item): item is HTMLButtonElement => item !== null && !item.disabled);
    const current = enabled.findIndex((item) => item === document.activeElement);
    enabled[(current + direction + enabled.length) % enabled.length]?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      focusSibling(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusSibling(-1);
    } else if (event.key === "Tab") {
      setIsOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative inline-flex" onKeyDown={handleKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        onClick={() => setIsOpen((open) => !open)}
        className="cursor-pointer rounded-control p-1.5 text-muted transition-colors hover:bg-bg hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <Icon name={IconName.MORE} />
      </button>
      {isOpen && (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 min-w-[220px] rounded-card border border-line-admin bg-surface py-1.5 shadow-lg"
        >
          {items.map((item, index) => (
            <button
              key={item.label}
              ref={(element) => {
                itemRefs.current[index] = element;
              }}
              type="button"
              role="menuitem"
              disabled={Boolean(item.disabledReason)}
              title={item.disabledReason}
              onClick={() => {
                close();
                item.onSelect();
              }}
              className={cn(
                "flex w-full cursor-pointer items-start gap-2.5 px-3.5 py-2 text-left text-[13px] font-medium",
                "hover:bg-bg focus:bg-bg focus:outline-none disabled:cursor-not-allowed disabled:opacity-60",
                item.tone === MenuItemTone.DANGER ? "text-danger" : "text-ink",
              )}
            >
              <Icon name={item.icon} className="mt-px h-4 w-4" />
              <span className="min-w-0">
                <span className="block">{item.label}</span>
                {item.disabledReason && <span className="block text-[11.5px] font-normal text-muted">{item.disabledReason}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
