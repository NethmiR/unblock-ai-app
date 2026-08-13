import type { AddressInfo } from "node:net";
import { createApp } from "../../src/app.js";
import type { ApiControllers } from "../../src/routes/index.route.js";

export interface TestServer {
  baseUrl: string;
  close: () => Promise<void>;
}

export async function startTestServer(controllers: ApiControllers): Promise<TestServer> {
  const app = createApp(controllers);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
