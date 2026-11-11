import type { AuthenticatedUser } from "../../lib/types/auth/auth.type.js";
import type { UserRecord } from "../../lib/types/user/user.type.js";

export function toAuthenticatedUser(record: UserRecord): AuthenticatedUser {
  return {
    id: record.id,
    email: record.email,
    fullName: record.fullName,
    permissions: [...record.permissions],
  };
}
