"use client";
import { useEffect, useId, useMemo, useState, type KeyboardEvent } from "react";
import { Icon } from "@/components/ui/icons/Icon";
import { controlClassName } from "@/components/ui/form/control-style";
import { UI_COPY } from "@/lib/constants/ui-copy";
import { cn } from "@/lib/utils/cn";
import { IconName } from "@/types/icon";
import type { ComboboxOption } from "@/types/combobox";

interface ComboboxProps {
  id?: string;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  placeholder: string;
  options: readonly ComboboxOption[];
  onSelect: (value: string) => void;
  selectedValues?: readonly string[];
  valueLabel?: string | null;
  onClear?: () => void;
  closeOnSelect?: boolean;
  loading?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  emptyMessage?: string;
  className?: string;
}

function matchesQuery(option: ComboboxOption, query: string): boolean {
  const term = query.trim().toLowerCase();
  if (term === "") return true;
  return [option.label, option.description, option.meta, option.group].some((text) => text?.toLowerCase().includes(term));
}

export function Combobox({
  id,
  ariaLabel,
  ariaDescribedBy,
  placeholder,
  options,
  onSelect,
  selectedValues = [],
  valueLabel = null,
  onClear,
  closeOnSelect = true,
  loading = false,
  disabled = false,
  invalid = false,
  emptyMessage = UI_COPY.noMatches,
  className,
}: ComboboxProps) {
  const generatedId = useId();
  const inputId = id ?? `${generatedId}-input`;
  const listboxId = `${generatedId}-listbox`;
  const optionId = (index: number) => `${generatedId}-option-${index}`;

  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const filtered = useMemo(() => options.filter((option) => matchesQuery(option, query)), [options, query]);
  const isEnabled = (index: number) => filtered[index] !== undefined && !filtered[index].disabledReason;

  useEffect(() => {
    if (!isOpen || activeIndex < 0) return;
    document.getElementById(`${generatedId}-option-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [isOpen, activeIndex, generatedId]);

  function open(): void {
    if (disabled) return;
    setIsOpen(true);
  }

  function close(): void {
    setIsOpen(false);
    setActiveIndex(-1);
  }

  function moveActive(direction: 1 | -1, from: number = activeIndex): void {
    for (let step = 1; step <= filtered.length; step += 1) {
      const candidate = (from + direction * step + filtered.length) % filtered.length;
      if (isEnabled(candidate)) {
        setActiveIndex(candidate);
        return;
      }
    }
  }

  function select(index: number): void {
    const option = filtered[index];
    if (!option || option.disabledReason) return;
    onSelect(option.value);
    setQuery("");
    if (closeOnSelect) close();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!isOpen) open();
        moveActive(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        if (!isOpen) open();
        moveActive(-1, activeIndex < 0 ? 0 : activeIndex);
        break;
      case "Home":
        if (isOpen) {
          event.preventDefault();
          moveActive(1, -1);
        }
        break;
      case "End":
        if (isOpen) {
          event.preventDefault();
          moveActive(-1, 0);
        }
        break;
      case "Enter":
        if (isOpen && activeIndex >= 0) {
          event.preventDefault();
          select(activeIndex);
        }
        break;
      case "Escape":
        if (isOpen) {
          event.preventDefault();
          close();
        } else if (query) {
          setQuery("");
        }
        break;
    }
  }

  return (
    <div className={cn("relative", className)}>
      <Icon name={IconName.SEARCH} className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
      <input
        id={inputId}
        type="text"
        role="combobox"
        autoComplete="off"
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={isOpen && activeIndex >= 0 ? optionId(activeIndex) : undefined}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        placeholder={valueLabel ?? placeholder}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(-1);
          open();
        }}
        onFocus={open}
        onClick={open}
        onBlur={close}
        onKeyDown={handleKeyDown}
        className={controlClassName(
          invalid,
          cn("h-10 pl-9", onClear && valueLabel ? "pr-9" : "pr-3.5", valueLabel && "placeholder:text-ink"),
        )}
      />
      {onClear && valueLabel && !disabled && (
        <button
          type="button"
          aria-label={UI_COPY.clearSelection}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onClear}
          className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded-control p-1 text-faint hover:bg-bg hover:text-ink"
        >
          <Icon name={IconName.CLOSE} className="h-4 w-4" />
        </button>
      )}

      {isOpen && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          aria-multiselectable={!closeOnSelect || undefined}
          onMouseDown={(event) => event.preventDefault()}
          className="absolute z-30 mt-1.5 max-h-72 w-full overflow-y-auto rounded-card border border-line-admin bg-surface py-1.5 shadow-lg"
        >
          {loading && <li className="px-3.5 py-2.5 text-[13px] text-muted">{UI_COPY.loadingOptions}</li>}
          {!loading && filtered.length === 0 && <li className="px-3.5 py-2.5 text-[13px] text-muted">{emptyMessage}</li>}
          {!loading &&
            filtered.map((option, index) => {
              const showGroup = option.group !== undefined && option.group !== filtered[index - 1]?.group;
              const isSelected = selectedValues.includes(option.value);
              const isDisabled = Boolean(option.disabledReason);
              return (
                <li key={option.value} role="presentation">
                  {showGroup && (
                    <div className="px-3.5 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wider text-faint">{option.group}</div>
                  )}
                  <div
                    id={optionId(index)}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={isDisabled || undefined}
                    onMouseEnter={() => !isDisabled && setActiveIndex(index)}
                    onClick={() => select(index)}
                    className={cn(
                      "flex items-start gap-2.5 px-3.5 py-2 text-[13px]",
                      isDisabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
                      index === activeIndex && "bg-accent/10",
                    )}
                  >
                    <span className="mt-0.5 flex h-4 w-4 flex-none items-center justify-center text-accent">
                      {isSelected && <Icon name={IconName.CHECK} className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-ink">{option.label}</span>
                      {(option.disabledReason ?? option.description) && (
                        <span className="block truncate text-[12px] text-muted">{option.disabledReason ?? option.description}</span>
                      )}
                    </span>
                    {option.meta && <span className="flex-none font-mono text-[11.5px] text-faint">{option.meta}</span>}
                  </div>
                </li>
              );
            })}
        </ul>
      )}
    </div>
  );
}
