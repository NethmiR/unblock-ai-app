"use client";
import useSWR, { type SWRResponse } from "swr";
import { fetcher } from "@/lib/api/client";
import { userListPath, userPath } from "@/lib/api/users";
import { userAffiliationsPath } from "@/lib/api/user-affiliations";
import type { UserListQuery, UserListResponse, UserResponse } from "@/types/user";
import type { UserAffiliationsResponse } from "@/types/user-affiliation";

export function useUsers(query: UserListQuery): SWRResponse<UserListResponse, unknown> {
  return useSWR<UserListResponse>(userListPath(query), fetcher, { keepPreviousData: true });
}

export function useUser(userId: string): SWRResponse<UserResponse, unknown> {
  return useSWR<UserResponse>(userPath(userId), fetcher);
}

export function useUserAffiliations(userId: string): SWRResponse<UserAffiliationsResponse, unknown> {
  return useSWR<UserAffiliationsResponse>(userAffiliationsPath(userId), fetcher);
}
