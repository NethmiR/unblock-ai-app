"use client";
import { useCallback, useState } from "react";
import { useToast } from "@/components/providers/ToastProvider";
import {
  LIFECYCLE_COPY,
  type LifecycleAction,
  type LifecycleCopySet,
  type LifecycleTarget,
} from "@/lib/organisation/lifecycle-action";

interface PendingLifecycle {
  action: LifecycleAction;
  target: LifecycleTarget;
}

export interface LifecycleDialogState {
  copy: LifecycleCopySet;
  pending: PendingLifecycle | null;
  busy: boolean;
  error: string | null;
  open: (action: LifecycleAction, target: LifecycleTarget) => void;
  close: () => void;
  confirm: () => Promise<void>;
}

interface LifecycleDialogOptions {
  perform: (action: LifecycleAction, target: LifecycleTarget) => Promise<void>;
  describeError: (err: unknown, fallback: string) => string;
  copy?: LifecycleCopySet;
}

export function useLifecycleDialog({ perform, describeError, copy = LIFECYCLE_COPY }: LifecycleDialogOptions): LifecycleDialogState {
  const toast = useToast();
  const [pending, setPending] = useState<PendingLifecycle | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = useCallback((action: LifecycleAction, target: LifecycleTarget) => {
    setError(null);
    setPending({ action, target });
  }, []);

  const close = useCallback(() => {
    setPending(null);
    setError(null);
  }, []);

  const confirm = useCallback(async () => {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      await perform(pending.action, pending.target);
      toast.success(copy[pending.action].success(pending.target.name));
      setPending(null);
    } catch (err) {
      setError(describeError(err, copy[pending.action].failure));
    } finally {
      setBusy(false);
    }
  }, [copy, describeError, pending, perform, toast]);

  return { copy, pending, busy, error, open, close, confirm };
}
