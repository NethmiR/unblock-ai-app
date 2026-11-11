import type { Request } from "express";
import { AUTHORIZATION_SCHEME } from "../../data/constants/auth.constant.js";

const SCHEME_PREFIX = `${AUTHORIZATION_SCHEME.toLowerCase()} `;

export function readBearerToken(req: Request): string | null {
  const header = req.header("authorization");
  if (!header || !header.toLowerCase().startsWith(SCHEME_PREFIX)) return null;
  const token = header.slice(SCHEME_PREFIX.length).trim();
  return token.length > 0 ? token : null;
}
