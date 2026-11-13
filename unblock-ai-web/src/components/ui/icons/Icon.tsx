import { cn } from "@/lib/utils/cn";
import { IconName } from "@/types/icon";

/**
 * Outline icons as data (24x24 stroke paths). Navigation config refers to an
 * icon by `IconName` rather than by component, so the config stays plain,
 * serializable data that both Server and Client Components can import.
 */
const ICON_PATHS: Record<IconName, string> = {
  [IconName.TASKS]:
    "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 7h6m-6 4h4",
  [IconName.APPROVALS]:
    "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0 1 12 2.944a11.955 11.955 0 0 1-8.618 3.04A12.02 12.02 0 0 0 3 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
  [IconName.WORKFLOWS]: "M4 4h6v6H4zM14 14h6v6h-6zM7 10v4a3 3 0 0 0 3 3h4",
  [IconName.USERS]:
    "M17 20h5v-2a3 3 0 0 0-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 0 1 5.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 0 1 9.288 0M15 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm6 3a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM7 10a2 2 0 1 1-4 0 2 2 0 0 1 4 0z",
  [IconName.CREATE]: "M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
  [IconName.LIST]: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  [IconName.INBOX]:
    "M20 13V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7m16 0v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-5m16 0h-2.586a1 1 0 0 0-.707.293l-2.414 2.414a1 1 0 0 1-.707.293h-3.172a1 1 0 0 1-.707-.293l-2.414-2.414A1 1 0 0 0 6.586 13H4",
  [IconName.HISTORY]: "M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
  [IconName.PROFILE]: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM12 14a7 7 0 0 0-7 7h14a7 7 0 0 0-7-7z",
  [IconName.SIGN_OUT]:
    "M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v1",
  [IconName.CHEVRON_DOWN]: "M19 9l-7 7-7-7",
  [IconName.MENU]: "M4 6h16M4 12h16M4 18h16",
  [IconName.CLOSE]: "M6 18L18 6M6 6l12 12",
  [IconName.ORGANISATION]:
    "M19 21V5a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5m-4 0h4",
  [IconName.FACULTY]: "M12 14l9-5-9-5-9 5 9 5zm0 0v6m-6.16-9.42L12 14l6.16-3.42M5 10.5v4.5c0 1.5 3.13 3 7 3s7-1.5 7-3v-4.5",
  [IconName.DIVISION]: "M4 5h6v6H4zM14 5h6v6h-6zM4 15h6v4H4zM14 15h6v4h-6z",
  [IconName.DESIGNATION]:
    "M10 6H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-5m-4 0V5a2 2 0 1 1 4 0v1m-4 0a2 2 0 1 0 4 0m-5 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 0 0-2.83 2M15 11h3m-3 4h2",
  [IconName.SEARCH]: "M21 21l-4.35-4.35M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0z",
  [IconName.MORE]:
    "M12 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm0 7a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm0 7a1 1 0 1 1 0-2 1 1 0 0 1 0 2z",
  [IconName.ARCHIVE]: "M5 8h14M5 8a2 2 0 1 1 0-4h14a2 2 0 1 1 0 4M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8m-9 4h4",
  [IconName.RESTORE]: "M4 4v5h.582m15.356 2A8.001 8.001 0 0 0 4.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 0 1-15.357-2m15.357 2H15",
  [IconName.TRASH]:
    "M19 7l-.867 12.142A2 2 0 0 1 16.138 21H7.862a2 2 0 0 1-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v3M4 7h16",
  [IconName.EDIT]:
    "M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5m-1.414-9.414a2 2 0 1 1 2.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
  [IconName.CHECK]: "M5 13l4 4L19 7",
  [IconName.CHEVRON_RIGHT]: "M9 5l7 7-7 7",
  [IconName.PLUS]: "M12 5v14m7-7H5",
  [IconName.MEMBERS]:
    "M12 4.354a4 4 0 1 1 0 5.292M15 21H3v-1a6 6 0 0 1 12 0v1zm0 0h6v-1a6 6 0 0 0-9-5.197M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z",
  [IconName.SPARKLE]:
    "M9.8 15.9 9 18.75l-.8-2.85a4.5 4.5 0 0 0-3.1-3.09L2.25 12l2.85-.81a4.5 4.5 0 0 0 3.1-3.09L9 5.25l.8 2.85a4.5 4.5 0 0 0 3.1 3.09l2.85.81-2.85.81a4.5 4.5 0 0 0-3.1 3.09zM18.26 8.72 18 9.75l-.26-1.03a3.38 3.38 0 0 0-2.45-2.46L14.25 6l1.04-.26a3.38 3.38 0 0 0 2.45-2.46L18 2.25l.26 1.03a3.38 3.38 0 0 0 2.46 2.46L21.75 6l-1.03.26a3.38 3.38 0 0 0-2.46 2.46z",
  [IconName.SEND]: "M12 19V5m-7 7 7-7 7 7",
  [IconName.LIGHTBULB]: "M9 18h6m-5 3h4M12 3a6 6 0 0 0-3.6 10.8c.6.45 1 1.15 1 1.9V16h5.2v-.3c0-.75.4-1.45 1-1.9A6 6 0 0 0 12 3z",
  [IconName.DOWNLOAD]: "M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2M7 10l5 5 5-5M12 15V3",
  [IconName.LOCK]: "M7 11V7a5 5 0 0 1 10 0v4M5 11h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z",
  [IconName.CLOCK]: "M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
  [IconName.CHECK_CIRCLE]: "M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
  [IconName.CROSS_CIRCLE]: "M15 9l-6 6m0-6l6 6m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
  [IconName.QUESTION]:
    "M8.23 9c.55-1.17 2.03-2 3.77-2 2.21 0 4 1.34 4 3 0 1.4-1.28 2.58-3 2.91-.55.1-1 .54-1 1.09m0 3h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
  [IconName.ARROW_UP_RIGHT]: "M7 17L17 7M8 7h9v9",
  [IconName.DOCUMENT]:
    "M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.59a1 1 0 0 1 .7.29l5.42 5.42a1 1 0 0 1 .29.7V19a2 2 0 0 1-2 2z",
  [IconName.CHAT]: "M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-5l-5 5v-5z",
  [IconName.REFRESH]: "M4 4v5h.582m15.356 2A8.001 8.001 0 0 0 4.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 0 1-15.357-2m15.357 2H15",
};

interface IconProps {
  name: IconName;
  className?: string;
}

/** Decorative by design (`aria-hidden`): pair it with visible text or an `aria-label` on the control. */
export function Icon({ name, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={cn("h-5 w-5 flex-none", className)}
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}
