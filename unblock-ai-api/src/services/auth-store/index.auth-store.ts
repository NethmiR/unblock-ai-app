import { PostgresAuthStore } from "./postgres.auth-store.js";
import { InMemoryAuthStore, type InMemoryAuthStoreOptions } from "./in-memory.auth-store.js";
import { ConfigurationError } from "../../errors/configuration.error.js";
import type { IAuthStore } from "./auth-store.interface.js";

export { PostgresAuthStore } from "./postgres.auth-store.js";
export { InMemoryAuthStore } from "./in-memory.auth-store.js";
export type { IAuthStore } from "./auth-store.interface.js";

export function createAuthStore(
  backend: "postgres" | "memory",
  memorySeed: InMemoryAuthStoreOptions = {},
): IAuthStore {
  if (backend === "postgres") return new PostgresAuthStore();
  if (backend === "memory") return new InMemoryAuthStore(memorySeed);
  throw new ConfigurationError(`Unknown auth store backend '${backend}'`);
}
