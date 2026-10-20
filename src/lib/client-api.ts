import { z } from "zod";
import { errorSchema } from "./contracts";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
export async function api<T>(path: string, schema: z.ZodType<T>, body?: unknown, method = "POST"): Promise<T> {
  const response = await fetch(path, {
    method, credentials: "same-origin", cache: "no-store",
    headers: { "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data: unknown = await response.json();
  if (!response.ok) {
    const parsed = errorSchema.safeParse(data);
    throw new ApiError(parsed.success ? parsed.data.error : "Something went wrong. Please retry.", response.status);
  }
  return schema.parse(data);
}
