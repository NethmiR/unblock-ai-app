import { apiRequest } from "./client";
import { withQuery } from "./query-string";
import type { CreateUserRequest, UserListQuery, UserListResponse, UserResponse } from "@/types/user";

export const USERS_PATH = "/users";

export function userListPath(query: UserListQuery = {}): string {
  return withQuery(USERS_PATH, query);
}

export function userPath(userId: string): string {
  return `${USERS_PATH}/${encodeURIComponent(userId)}`;
}

export const usersApi = {
  list: (query: UserListQuery = {}) => apiRequest<UserListResponse>(userListPath(query)),

  get: (userId: string) => apiRequest<UserResponse>(userPath(userId)),

  create: (body: CreateUserRequest) => apiRequest<UserResponse>(USERS_PATH, { method: "POST", body }),
};
