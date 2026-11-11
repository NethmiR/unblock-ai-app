import { apiRequest } from "./client";
import type { RevokeOtherUserSessionsResponse, UserSessionListResponse } from "@/types/auth";

export const USER_SESSIONS_PATH = "/auth/sessions";

export const userSessionsApi = {
  list: () => apiRequest<UserSessionListResponse>(USER_SESSIONS_PATH),

  revoke: (sessionId: string) =>
    apiRequest<void>(`${USER_SESSIONS_PATH}/${encodeURIComponent(sessionId)}`, { method: "DELETE" }),

  revokeOthers: () =>
    apiRequest<RevokeOtherUserSessionsResponse>(`${USER_SESSIONS_PATH}/others`, { method: "DELETE" }),
};
