import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { ACCESS_COOKIE, createAccessCookie, matchesAccessCode } from "@/lib/access-cookie";
import { serverEnv } from "@/lib/server/env";
import { checkOrigin, endpoint, HttpError, ipKey, jsonBody, rateLimit } from "@/lib/server/http";

export async function POST(request: NextRequest) {
  return endpoint(async () => {
    checkOrigin(request);
    await rateLimit(`access:${ipKey(request)}`, 10, 600);
    const { code } = await jsonBody(request, z.object({ code: z.string().min(1).max(200) }));
    const env = serverEnv();
    if (!matchesAccessCode(code, env.DEMO_ACCESS_CODE)) throw new HttpError(401, "That access code isn’t correct.");
    (await cookies()).set(ACCESS_COOKIE, createAccessCookie(env.ACCESS_COOKIE_SECRET, env.DEMO_ACCESS_CODE), {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 86400,
    });
    return { ok: true };
  });
}
