import { cn } from "@/lib/utils/cn";

type AvatarSize = "sm" | "md" | "lg";

const SIZES: Record<AvatarSize, string> = {
  sm: "h-[26px] w-[26px] text-[11px]",
  md: "h-9 w-9 text-[12.5px]",
  lg: "h-12 w-12 text-[15px]",
};

interface AvatarProps {
  initials: string;
  size?: AvatarSize;
  className?: string;
}

/** Initials avatar. Decorative - the user's name is always shown beside it. */
export function Avatar({ initials, size = "md", className }: AvatarProps) {
  return (
    <div
      aria-hidden="true"
      className={cn("flex flex-none items-center justify-center rounded-full bg-ink font-semibold text-white", SIZES[size], className)}
    >
      {initials}
    </div>
  );
}
