import "server-only";
import { z } from "zod";

const envSchema = z.object({
  DEMO_ACCESS_CODE: z.string().min(6),
  ACCESS_COOKIE_SECRET: z.string().min(32),
  GEMINI_API_KEY: z.string().min(1),
  SUPABASE_URL: z.url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
});
export function serverEnv(): z.infer<typeof envSchema> {
  const result = envSchema.safeParse(process.env);
  if (!result.success) throw new Error("Server configuration is incomplete. Check .env.local against .env.example.");
  return result.data;
}
export function missingConfiguration(): string[] {
  const result = envSchema.safeParse(process.env);
  return result.success ? [] : [...new Set(result.error.issues.map((issue) => issue.path.join(".")))];
}
