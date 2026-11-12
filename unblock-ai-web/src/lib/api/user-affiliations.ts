import { apiRequest } from "./client";
import { userPath } from "./users";
import type { ReplaceUserAffiliationsRequest, UserAffiliationsResponse } from "@/types/user-affiliation";

export const CURRENT_USER_AFFILIATIONS_PATH = "/auth/me/affiliations";

export function userAffiliationsPath(userId: string): string {
  return `${userPath(userId)}/affiliations`;
}

export const userAffiliationsApi = {
  forUser: (userId: string) => apiRequest<UserAffiliationsResponse>(userAffiliationsPath(userId)),

  forCurrentUser: () => apiRequest<UserAffiliationsResponse>(CURRENT_USER_AFFILIATIONS_PATH),

  replace: (userId: string, body: ReplaceUserAffiliationsRequest) =>
    apiRequest<UserAffiliationsResponse>(userAffiliationsPath(userId), { method: "PUT", body }),
};
