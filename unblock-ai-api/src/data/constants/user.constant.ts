export enum UserStatus {
  ACTIVE = "active",
  DISABLED = "disabled",
}

export const USER_FIELD_LIMIT = {
  EMAIL_MAX_LENGTH: 254,
  FULL_NAME_MAX_LENGTH: 200,
} as const;

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const USER_LIST_PAGINATION = {
  DEFAULT_LIMIT: 25,
  MAX_LIMIT: 100,
  SEARCH_MAX_LENGTH: 100,
} as const;
