import { describe, expect, it } from "vitest";
import { createAccessCookie, matchesAccessCode, verifyAccessCookie } from "../src/lib/access-cookie";
const secret = "test-secret-that-is-longer-than-thirty-two-characters";
describe("demo access", () => {
  it("accepts only an unexpired signed cookie for the current access code", () => {
    const now = 1_800_000_000_000; const cookie = createAccessCookie(secret, "shared-demo", now);
    expect(verifyAccessCookie(cookie, secret, "shared-demo", now + 1)).toBe(true);
    expect(verifyAccessCookie(cookie, secret, "shared-demo", now + 86_400_000)).toBe(false);
    expect(verifyAccessCookie(cookie, secret, "rotated-code", now)).toBe(false);
    expect(verifyAccessCookie(cookie, "another-secret", "shared-demo", now)).toBe(false);
  });
  it("rejects malformed, tampered, missing and future cookies", () => {
    const now = 1_800_000_000_000;
    for (const cookie of [undefined, "", "abc", "123.abc", createAccessCookie(secret, "demo", now) + ".extra", createAccessCookie(secret, "demo", now + 1000)]) expect(verifyAccessCookie(cookie, secret, "demo", now)).toBe(false);
    expect(matchesAccessCode("demo", "demo")).toBe(true); expect(matchesAccessCode("demo ", "demo")).toBe(false);
  });
});
