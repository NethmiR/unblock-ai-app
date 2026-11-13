import { Icon } from "@/components/ui/icons/Icon";
import { controlClassName } from "@/components/ui/form/control-style";
import { TASK_REQUEST_COPY } from "@/lib/task-request/task-request-copy";
import { IconName } from "@/types/icon";
import type { FieldControlProps } from "@/components/ui/form/FormField";

interface LockedFieldValueProps extends FieldControlProps {
  text: string;
  locked: boolean;
}

export function LockedFieldValue({ text, locked, ...control }: LockedFieldValueProps) {
  return (
    <div className="relative">
      <input
        {...control}
        type="text"
        readOnly
        value={text}
        aria-readonly="true"
        className={controlClassName(false, "h-10 cursor-default border-line-admin bg-bg pr-9 text-muted focus:ring-accent/20")}
      />
      {locked && (
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-faint" title={TASK_REQUEST_COPY.forms.lockedLabel}>
          <Icon name={IconName.LOCK} className="h-4 w-4" />
        </span>
      )}
    </div>
  );
}
