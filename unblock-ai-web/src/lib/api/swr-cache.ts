import { mutate } from "swr";

export function revalidateApiPaths(...prefixes: readonly string[]): Promise<unknown[]> {
  return mutate((key) => typeof key === "string" && prefixes.some((prefix) => key.startsWith(prefix)));
}
