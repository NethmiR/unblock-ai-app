import { NotFoundError } from "./not-found.error.js";
import { UserErrorCode } from "../data/constants/user-error.constant.js";

export function userNotFound(id: string): NotFoundError {
  return new NotFoundError(`User '${id}' not found`, { code: UserErrorCode.USER_NOT_FOUND });
}
