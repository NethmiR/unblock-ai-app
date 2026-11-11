import { PERMISSIONS, type Permission } from "../../data/constants/permission.constant.js";

export function isPermission(value: unknown): value is Permission {
  return typeof value === "string" && (PERMISSIONS as readonly string[]).includes(value);
}

export function hasAnyPermission(granted: readonly Permission[], required: readonly Permission[]): boolean {
  return required.some((permission) => granted.includes(permission));
}
