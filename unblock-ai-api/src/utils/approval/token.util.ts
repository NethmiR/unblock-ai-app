import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { ApprovalTokenPayload } from "../../lib/types/approval/token.type.js";

function base64url(input: Buffer | string): string {
  const buffer = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buffer.toString("base64url");
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("base64url");
}

export function issueToken(taskId: string, stepId: string, secret: string): string {
  const nonce = randomBytes(16).toString("hex");
  const payload = base64url(JSON.stringify({ t: taskId, s: stepId, n: nonce }));
  return `${payload}.${sign(payload, secret)}`;
}

export function parseToken(token: string): ApprovalTokenPayload | null {
  if (typeof token !== "string") return null;

  const dotIndex = token.indexOf(".");
  if (dotIndex <= 0 || dotIndex === token.length - 1) return null;

  const payload = token.slice(0, dotIndex);

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (
    typeof decoded !== "object" ||
    decoded === null ||
    typeof (decoded as Record<string, unknown>).t !== "string" ||
    typeof (decoded as Record<string, unknown>).s !== "string" ||
    typeof (decoded as Record<string, unknown>).n !== "string"
  ) {
    return null;
  }

  const record = decoded as { t: string; s: string; n: string };
  return { task_id: record.t, step_id: record.s, nonce: record.n };
}

export function verifyToken(token: string, secret: string): ApprovalTokenPayload | null {
  if (typeof token !== "string") return null;

  const dotIndex = token.indexOf(".");
  if (dotIndex <= 0 || dotIndex === token.length - 1) return null;

  const payload = token.slice(0, dotIndex);
  const signature = token.slice(dotIndex + 1);

  const expected = Buffer.from(sign(payload, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }

  return parseToken(token);
}
