import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { ApprovalTokenPayload, IssuedApprovalToken } from "../../lib/types/approval/token.type.js";

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const TOKEN_SEPARATOR = ".";

function base64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("base64url");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function hashApprovalToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function issueToken(taskId: string, stepId: string, secret: string): string {
  const nonce = randomBytes(16).toString("hex");
  const payload = base64url(JSON.stringify({ t: taskId, s: stepId, n: nonce }));
  return `${payload}${TOKEN_SEPARATOR}${sign(payload, secret)}`;
}

export function issueApprovalToken(taskId: string, stepId: string, secret: string, ttlDays: number, now: Date): IssuedApprovalToken {
  const token = issueToken(taskId, stepId, secret);
  return { token, tokenHash: hashApprovalToken(token), expiresAt: new Date(now.getTime() + ttlDays * MILLISECONDS_PER_DAY) };
}

export function parseToken(token: string): ApprovalTokenPayload | null {
  const dotIndex = token.indexOf(TOKEN_SEPARATOR);
  if (dotIndex <= 0 || dotIndex === token.length - 1) return null;

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(token.slice(0, dotIndex), "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (!isRecord(decoded) || typeof decoded.t !== "string" || typeof decoded.s !== "string" || typeof decoded.n !== "string") return null;
  return { task_id: decoded.t, step_id: decoded.s, nonce: decoded.n };
}

export function verifyToken(token: string, secret: string): ApprovalTokenPayload | null {
  const dotIndex = token.indexOf(TOKEN_SEPARATOR);
  if (dotIndex <= 0 || dotIndex === token.length - 1) return null;

  const expected = Buffer.from(sign(token.slice(0, dotIndex), secret));
  const actual = Buffer.from(token.slice(dotIndex + 1));
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  return parseToken(token);
}
