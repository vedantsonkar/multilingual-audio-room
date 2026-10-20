import { createHmac, createHash, timingSafeEqual } from "node:crypto";

export const ACCESS_COOKIE = "audio-room-access";
function digest(value: string): Buffer { return createHash("sha256").update(value).digest(); }
export function matchesAccessCode(value: string, expected: string): boolean {
  return timingSafeEqual(digest(value), digest(expected));
}
function signature(expiry: string, secret: string, code: string): string {
  return createHmac("sha256", secret).update(`${expiry}:${digest(code).toString("hex")}`).digest("hex");
}
export function createAccessCookie(secret: string, code: string, now = Date.now()): string {
  const expiry = String(now + 24 * 60 * 60 * 1000);
  return `${expiry}.${signature(expiry, secret, code)}`;
}
export function verifyAccessCookie(value: string | undefined, secret: string, code: string, now = Date.now()): boolean {
  if (!value) return false;
  const parts = value.split(".");
  const expiry = parts[0]; const signed = parts[1];
  if (parts.length !== 2 || !expiry || !signed || !/^\d{13}$/.test(expiry) || !/^[a-f0-9]{64}$/.test(signed)) return false;
  const timestamp = Number(expiry);
  if (timestamp <= now || timestamp > now + 24 * 60 * 60 * 1000) return false;
  return matchesAccessCode(signed, signature(expiry, secret, code));
}
