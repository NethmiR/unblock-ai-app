import { authHeaderFor, type TestIdentity } from "./test-server.helper.js";

export enum HttpMethod {
  GET = "GET",
  POST = "POST",
  PUT = "PUT",
  PATCH = "PATCH",
  DELETE = "DELETE",
}

export function sendJson(
  baseUrl: string,
  method: HttpMethod,
  path: string,
  identity: TestIdentity | null,
  body?: unknown,
): Promise<Response> {
  return fetch(`${baseUrl}/api${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(identity === null ? {} : authHeaderFor(identity)),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}
