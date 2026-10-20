import "server-only";
import { createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ACCESS_COOKIE, verifyAccessCookie } from "../access-cookie";
import { adminClient, sessionClient } from "./supabase";
import { serverEnv } from "./env";

export class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
export async function demoAccess(): Promise<boolean> {
  const env = serverEnv();
  return verifyAccessCookie((await cookies()).get(ACCESS_COOKIE)?.value, env.ACCESS_COOKIE_SECRET, env.DEMO_ACCESS_CODE);
}
export async function requireAccess(): Promise<void> {
  if (!await demoAccess()) throw new HttpError(401, "Enter the demo access code to continue.");
}
export async function guestUser(): Promise<string> {
  await requireAccess();
  const client = await sessionClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new HttpError(401, "Your guest session expired. Please join again.");
  return data.user.id;
}
export function checkOrigin(request: NextRequest): void {
  if (request.headers.get("origin") !== request.nextUrl.origin) throw new HttpError(403, "This request must come from the app.");
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new HttpError(415, "Expected JSON.");
}
export async function jsonBody<T>(request: NextRequest, schema: z.ZodType<T>): Promise<T> {
  const body = await request.text();
  if (body.length > 4096) throw new HttpError(413, "Request is too large.");
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { throw new HttpError(400, "Invalid JSON."); }
  return schema.parse(parsed);
}
export async function rateLimit(key: string, limit: number, window = 60): Promise<void> {
  const { data, error } = await adminClient().rpc("consume_request", { p_key: key, p_limit: limit, p_window: window });
  if (error) throw new HttpError(503, "Room services are temporarily unavailable.");
  if (!data) throw new HttpError(429, "Too many requests. Please wait a moment and retry.");
}
export function ipKey(request: NextRequest): string {
  const header = process.env.TRUSTED_IP_HEADER ?? (process.env.VERCEL ? "x-vercel-forwarded-for" : "");
  const ip = header ? request.headers.get(header)?.split(",")[0]?.trim() ?? "unknown" : "local";
  return createHmac("sha256", serverEnv().ACCESS_COOKIE_SECRET).update(ip).digest("hex");
}
export async function endpoint(work: () => Promise<unknown>): Promise<NextResponse> {
  try { return NextResponse.json(await work(), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error: unknown) {
    if (error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
    console.error("Request failed", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "The service is unavailable. Check server configuration and try again." }, { status: 503 });
  }
}
