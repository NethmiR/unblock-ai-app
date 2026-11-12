type QueryValue = string | number | boolean | null | undefined;

export function withQuery<T extends { [K in keyof T]: QueryValue }>(path: string, query: T): string {
  const params = new URLSearchParams();
  for (const key of Object.keys(query) as (keyof T & string)[]) {
    const value: QueryValue = query[key];
    if (value === undefined || value === null || value === "" || value === false) continue;
    params.set(key, String(value));
  }
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}
