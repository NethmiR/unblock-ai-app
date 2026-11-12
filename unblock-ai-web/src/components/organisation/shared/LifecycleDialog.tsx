"use client";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FormField } from "@/components/ui/form/FormField";
import { TextInput } from "@/components/ui/form/TextInput";
import { DELETE_CONFIRMATION_PROMPT, LifecycleAction, type LifecycleTarget } from "@/lib/organisation/lifecycle-action";
import type { LifecycleDialogState } from "@/lib/hooks/useLifecycleDialog";

export function LifecycleDialog({ state }: { state: LifecycleDialogState }) {
  if (!state.pending) return null;
  const { action, target } = state.pending;
  return <LifecycleConfirmation key={`${action}:${target.id}`} action={action} target={target} state={state} />;
}

interface LifecycleConfirmationProps {
  action: LifecycleAction;
  target: LifecycleTarget;
  state: LifecycleDialogState;
}

function LifecycleConfirmation({ action, target, state }: LifecycleConfirmationProps) {
  const [typedCode, setTypedCode] = useState("");
  const copy = state.copy[action];
  const requiresTypedCode = action === LifecycleAction.DELETE;

  return (
    <ConfirmDialog
      title={copy.title(target.name)}
      confirmLabel={copy.confirm}
      busyLabel={copy.busy}
      tone={action === LifecycleAction.RESTORE ? "default" : "danger"}
      busy={state.busy}
      error={state.error}
      canConfirm={!requiresTypedCode || typedCode.trim() === target.code}
      onConfirm={() => void state.confirm()}
      onCancel={state.close}
    >
      <p>{copy.body(target.name)}</p>
      {requiresTypedCode && (
        <FormField label={DELETE_CONFIRMATION_PROMPT(target.code)} className="mt-4">
          {(control) => (
            <TextInput {...control} value={typedCode} autoComplete="off" onChange={(event) => setTypedCode(event.target.value)} />
          )}
        </FormField>
      )}
    </ConfirmDialog>
  );
}
