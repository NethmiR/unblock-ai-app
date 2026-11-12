import type { Metadata } from "next";
import type { RoutePath } from "@/lib/routing/route-path";
import { getPageMeta } from "./navigation-access";

/** A dashboard page's `<title>` and description, read from the navigation config. */
export function dashboardPageMetadata(route: RoutePath): Metadata {
  const meta = getPageMeta(route);
  return meta ? { title: meta.title, description: meta.description } : {};
}
