import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";

import { env } from "~/env";

const ALGO = "aes-256-gcm";
const IV_LENGTH = 16;

/**
 * Supports:
 * - `openssl rand -base64 32` (typical ~44-character base64 → 32 bytes)
 * - `openssl rand -hex 32` (64 hex characters → 32 bytes)
 * - Any passphrase of at least 8 characters (derived with SHA-256 to 32 bytes)
 */
function getKey(): Buffer {
  const raw = env.APP_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error(
      "APP_ENCRYPTION_KEY is not set. Add it to .env (e.g. openssl rand -base64 32).",
    );
  }

  // 64 hex chars from `openssl rand -hex 32`
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }

  const fromBase64 = Buffer.from(raw, "base64");
  if (fromBase64.length === 32) {
    return fromBase64;
  }

  const looksLikeBase64 =
    raw.length >= 32 && /^[A-Za-z0-9+/]+=*$/.test(raw.replace(/\s/g, ""));
  if (looksLikeBase64 && fromBase64.length > 0 && fromBase64.length !== 32) {
    throw new Error(
      "APP_ENCRYPTION_KEY: base64 must decode to exactly 32 bytes. Run: openssl rand -base64 32",
    );
  }

  if (raw.length >= 8) {
    return createHash("sha256").update(raw, "utf8").digest();
  }

  throw new Error(
    "APP_ENCRYPTION_KEY: use `openssl rand -base64 32`, `openssl rand -hex 32`, or a passphrase with at least 8 characters",
  );
}

/**
 * Returns "iv:authTag:ciphertext" as base64 segments joined by colons (all base64url-safe via base64)
 */
export function encryptSecret(plain: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(
    ":",
  );
}

export function decryptSecret(payload: string): string {
  const key = getKey();
  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted payload");
  }
  const [ivB64, tagB64, dataB64] = parts;
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Invalid encrypted payload");
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
