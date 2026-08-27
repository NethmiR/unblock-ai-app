"use client";
import { useSyncExternalStore } from "react";
import { formatDateTime } from "@/lib/utils/format";

/**
 * The viewer's timezone is a client-only fact, so it is modelled as an external
 * store rather than state: `useSyncExternalStore` renders the SERVER snapshot
 * during SSR and hydration, then re-renders with the CLIENT snapshot. Both
 * passes agree on the text, which is the whole point.
 *
 * It never changes for the life of the page, so there is nothing to subscribe
 * to and the unsubscribe is a no-op.
 */
const subscribe = () => () => {};
const getClientZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const getServerZone = () => "UTC";

/**
 * An absolute timestamp rendered in the VIEWER's timezone.
 *
 * Why this is a component and not a bare `formatDateTime()` call: the server
 * cannot know the browser's timezone, so one formatted string cannot be correct
 * in both render passes. Formatting with the ambient zone (the old behaviour)
 * produced "09:12" in the server's UTC HTML and "14:42" in a UTC+5:30 browser,
 * and React failed hydration on the difference - every time, not just at an edge.
 *
 * The server HTML therefore carries the UTC rendering and the browser corrects
 * it to local on the first client render. That visible correction is the cost
 * of the zone being unknowable server-side; rendering nothing until mount would
 * trade it for a layout shift and a timestamp-less SSR payload.
 *
 * `dateTime` carries the unambiguous instant for machines regardless.
 */
export function DateTime({ iso, className }: { iso: string; className?: string }) {
  const zone = useSyncExternalStore(subscribe, getClientZone, getServerZone);

  return (
    <time dateTime={iso} className={className}>
      {formatDateTime(iso, zone)}
    </time>
  );
}
