import type { AddressInfo } from "node:net";
import { createApp } from "../../src/app.js";
import { createAuthStore } from "../../src/services/auth-store/index.auth-store.js";
import { AuthService } from "../../src/services/auth.service.js";
import type { ApiControllers } from "../../src/routes/index.route.js";
import type { AppConfig } from "../../src/lib/types/config/config.type.js";

export interface TestServer {
  baseUrl: string;
  close: () => Promise<void>;
}

/** No real Postgres needed for route tests - the in-memory store backs auth (D-5). */
function defaultAuthService(): AuthService {
  const authConfig: AppConfig["auth"] = {
    sessionTokenSecret: "test-session-secret",
    sessionTtlHours: 12,
    maxFailedAttempts: 0,
    storeBackend: "memory",
  };
  return new AuthService({ authStore: createAuthStore("memory"), config: { auth: authConfig } as AppConfig });
}

export async function startTestServer(
  controllers: ApiControllers,
  deps: { authService?: AuthService } = {},
): Promise<TestServer> {
  const app = createApp(controllers, { authService: deps.authService ?? defaultAuthService() });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
