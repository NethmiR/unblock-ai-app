import { apiRequest } from "./client";

export interface HealthStatus {
  status: "ok";
  /** Process uptime in SECONDS (a float), not milliseconds. */
  uptime: number;
  /** The API's package.json version, not the schema version. */
  version: string;
}

/**
 * Liveness only. This endpoint does NOT touch Mongo or Azure, so a healthy
 * response means the process is up - it does not mean extraction or retrieval
 * will succeed. Use it for a connection banner, never as a readiness gate.
 */
export const healthApi = {
  check: (signal?: AbortSignal) => apiRequest<HealthStatus>("/health", { signal }),
};
