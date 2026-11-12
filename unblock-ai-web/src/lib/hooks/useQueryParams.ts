"use client";
import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export interface QueryParams<K extends string> {
  get: (key: K) => string | null;
  set: (updates: Partial<Record<K, string | null>>) => void;
}

export function useQueryParams<K extends string>(): QueryParams<K> {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const get = useCallback((key: K) => searchParams.get(key), [searchParams]);

  const set = useCallback(
    (updates: Partial<Record<K, string | null>>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates) as [K, string | null | undefined][]) {
        if (value === null || value === undefined || value === "") next.delete(key);
        else next.set(key, value);
      }
      const search = next.toString();
      router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return useMemo(() => ({ get, set }), [get, set]);
}
