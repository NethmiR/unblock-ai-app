import { cn } from "@/lib/utils/cn";
import { APP_CONFIG } from "@/lib/config/app.config";

type BrandMarkSize = "sm" | "md";

const SIZES: Record<BrandMarkSize, string> = {
  sm: "h-[26px] w-[26px] text-xs",
  md: "h-9 w-9 text-sm",
};

/** The app's square logo mark. Decorative - always rendered beside the app name. */
export function BrandMark({ size = "sm", className }: { size?: BrandMarkSize; className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("flex flex-none items-center justify-center rounded-lg bg-ink font-bold text-white", SIZES[size], className)}
    >
      {APP_CONFIG.initial}
    </div>
  );
}
