import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: object,
) => Promise<Buffer>;

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;
// Node's default maxmem is 32MB; N=16384,r=8 needs ~16MB plus overhead and throws
// ERR_CRYPTO_INVALID_SCRYPT_PARAMS intermittently without an explicit raise.
const MAXMEM = 64 * 1024 * 1024;

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(plain.normalize("NFKC"), salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

/** Never throws - a malformed stored hash is a `false`, not a 500. */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split("$");
    if (parts.length !== 6) return false;
    const [scheme, sN, sR, sP, saltB64, hashB64] = parts as [string, string, string, string, string, string];
    if (scheme !== "scrypt") return false;

    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(hashB64, "base64");
    const actual = await scrypt(plain.normalize("NFKC"), salt, expected.length, {
      N: Number(sN),
      r: Number(sR),
      p: Number(sP),
      maxmem: MAXMEM,
    });

    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/**
 * Burns roughly one hash's worth of time so a login POST for an UNKNOWN username
 * costs the same as one for a known username. Without this, response latency
 * leaks which usernames exist.
 */
export async function burnHashTime(): Promise<void> {
  await scrypt("x", Buffer.alloc(16), KEYLEN, { N, r: R, p: P, maxmem: MAXMEM }).catch(() => {});
}
