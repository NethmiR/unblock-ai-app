import { AuthErrorCode } from "@/types/auth";

const GENERIC_MESSAGE = "Something went wrong. Please try again.";

const AUTH_ERROR_MESSAGES: Record<AuthErrorCode, string> = {
  [AuthErrorCode.INVALID_CREDENTIALS]: "Invalid email or password.",
  [AuthErrorCode.ACCOUNT_LOCKED]: "Your account is temporarily locked after too many failed attempts. Try again later.",
  [AuthErrorCode.ACCOUNT_DISABLED]: "Your account is disabled. Contact your administrator.",
  [AuthErrorCode.AUTHENTICATION_REQUIRED]: "Your session has ended. Please sign in again.",
  [AuthErrorCode.PERMISSION_DENIED]: "You do not have permission to do that.",
  [AuthErrorCode.USER_SESSION_NOT_FOUND]: "That session has already ended.",
};

function isAuthErrorCode(code: string): code is AuthErrorCode {
  return (Object.values(AuthErrorCode) as string[]).includes(code);
}

export function messageForAuthError(code: string | undefined): string {
  return code && isAuthErrorCode(code) ? AUTH_ERROR_MESSAGES[code] : GENERIC_MESSAGE;
}
