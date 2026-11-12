import type { AuthContext } from "../auth/auth.type.js";

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      auth?: AuthContext;
    }
  }
}

export interface ErrorResponseBody {
  error: string;
  code: string;
  details: unknown;
}

