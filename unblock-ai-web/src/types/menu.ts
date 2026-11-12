import type { IconName } from "./icon";

export enum MenuItemTone {
  DEFAULT = "default",
  DANGER = "danger",
}

export interface MenuItem {
  label: string;
  icon: IconName;
  onSelect: () => void;
  tone?: MenuItemTone;
  disabledReason?: string;
}
