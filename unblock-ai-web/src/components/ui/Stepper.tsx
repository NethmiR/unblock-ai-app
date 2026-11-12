import { Icon } from "@/components/ui/icons/Icon";
import { cn } from "@/lib/utils/cn";
import { IconName } from "@/types/icon";

interface StepperProps {
  steps: readonly string[];
  currentIndex: number;
  label: string;
}

export function Stepper({ steps, currentIndex, label }: StepperProps) {
  return (
    <ol aria-label={label} className="flex items-center gap-3">
      {steps.map((step, index) => {
        const isComplete = index < currentIndex;
        const isCurrent = index === currentIndex;
        return (
          <li key={step} aria-current={isCurrent ? "step" : undefined} className="flex min-w-0 items-center gap-3">
            {index > 0 && <span aria-hidden="true" className={cn("h-px w-8 flex-none sm:w-14", isComplete || isCurrent ? "bg-accent" : "bg-line")} />}
            <span
              className={cn(
                "flex h-7 w-7 flex-none items-center justify-center rounded-full text-[12.5px] font-semibold",
                isComplete && "bg-accent text-white",
                isCurrent && "border-2 border-accent text-accent",
                !isComplete && !isCurrent && "border border-line-admin text-faint",
              )}
            >
              {isComplete ? <Icon name={IconName.CHECK} className="h-4 w-4" /> : index + 1}
            </span>
            <span className={cn("truncate text-[13px] font-semibold", isCurrent ? "text-ink" : "text-muted")}>{step}</span>
          </li>
        );
      })}
    </ol>
  );
}
