import { cn } from "@/lib/utils/cn";
import type { InputHTMLAttributes } from "react";

type SearchInputProps = InputHTMLAttributes<HTMLInputElement>;

export function SearchInput({ className, ...props }: SearchInputProps) {
  return (
    <input
      type="search"
      {...props}
      className={cn(
        "h-10 w-full rounded-control border border-line-admin bg-surface px-3.5 text-[13.5px] text-ink",
        "placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-accent/30",
        className,
      )}
    />
  );
}
