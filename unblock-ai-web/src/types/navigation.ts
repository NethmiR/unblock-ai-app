import type { IconName } from "./icon";
import type { Permission } from "./permission";
import type { RoutePath } from "@/lib/routing/route-path";

/** Heading shown in the top bar and used for the document `<title>`. */
export interface PageMeta {
  title: string;
  description: string;
}

/** A single sidebar link and the page it opens. */
export interface NavItem extends PageMeta {
  label: string;
  href: RoutePath;
  icon: IconName;
}

/** A collapsible sidebar group, shown only to users holding `permission`. */
export interface NavGroup {
  permission: Permission;
  label: string;
  icon: IconName;
  items: readonly NavItem[];
}
