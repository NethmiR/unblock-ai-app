/** Shared interface copy. Feature-specific labels live beside their config (e.g. navigation). */
export const AUTH_COPY = {
  signOut: "Sign out",
  signingOut: "Signing out…",
} as const;

export const DASHBOARD_COPY = {
  functionsSectionLabel: "Functions",
  accountSectionLabel: "Account",
  navigationLabel: "Dashboard navigation",
  openNavigation: "Open navigation",
  closeNavigation: "Close navigation",
  viewProfile: "View profile",
} as const;

export const UI_COPY = {
  cancel: "Cancel",
  close: "Close",
  dismiss: "Dismiss",
  retry: "Try again",
  save: "Save changes",
  saving: "Saving…",
  discard: "Discard",
  unsavedChanges: "You have unsaved changes",
  noMatches: "No matches",
  loadingOptions: "Loading…",
  clearSelection: "Clear selection",
  moreActions: "More actions",
  previousPage: "Previous",
  nextPage: "Next",
  required: "Required",
  leaveTitle: "Leave without saving?",
  leaveBody: "Your unsaved changes will be lost.",
  leaveConfirm: "Leave page",
  stay: "Stay",
  showingRange: (first: number, last: number, total: number) => `Showing ${first}–${last} of ${total}`,
} as const;
