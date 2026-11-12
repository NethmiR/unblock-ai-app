export enum LifecycleAction {
  ARCHIVE = "archive",
  RESTORE = "restore",
  DELETE = "delete",
}

export interface LifecycleTarget {
  id: string;
  code: string;
  name: string;
}

export interface LifecycleCopy {
  title: (name: string) => string;
  body: (name: string) => string;
  confirm: string;
  busy: string;
  success: (name: string) => string;
  failure: string;
}

export type LifecycleCopySet = Record<LifecycleAction, LifecycleCopy>;

export const LIFECYCLE_COPY: LifecycleCopySet = {
  [LifecycleAction.ARCHIVE]: {
    title: (name) => `Archive ${name}?`,
    body: (name) =>
      `${name} will be hidden from pickers and cannot be newly assigned. Existing affiliations stay visible and it can be restored at any time.`,
    confirm: "Archive",
    busy: "Archiving…",
    success: (name) => `${name} was archived.`,
    failure: "We couldn't archive this item.",
  },
  [LifecycleAction.RESTORE]: {
    title: (name) => `Restore ${name}?`,
    body: (name) => `${name} will be available for new assignments again.`,
    confirm: "Restore",
    busy: "Restoring…",
    success: (name) => `${name} was restored.`,
    failure: "We couldn't restore this item.",
  },
  [LifecycleAction.DELETE]: {
    title: (name) => `Delete ${name} permanently?`,
    body: (name) => `${name} will be removed for good. This cannot be undone.`,
    confirm: "Delete permanently",
    busy: "Deleting…",
    success: (name) => `${name} was deleted.`,
    failure: "We couldn't delete this item.",
  },
};

export const DELETE_CONFIRMATION_PROMPT = (code: string) => `Type ${code} to confirm`;
