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
  const result = envSchema.safeParse(resolvedEnvironment());
  if (!result.success) throw new Error("Server configuration is incomplete. Check .env.local against .env.example.");
  return result.data;
}
export function missingConfiguration(): string[] {
  const result = envSchema.safeParse(resolvedEnvironment());
  return result.success ? [] : [...new Set(result.error.issues.map((issue) => issue.path.join(".")))];
}
function resolvedEnvironment(): Record<string, string | undefined> {
  return {
    DEMO_ACCESS_CODE: process.env.DEMO_ACCESS_CODE,
    ACCESS_COOKIE_SECRET: process.env.ACCESS_COOKIE_SECRET,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    SUPABASE_URL: process.env.SUPABASE_URL || process.env.STORAGE_SUPABASE_URL || process.env.NEXT_PUBLIC_STORAGE_SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.STORAGE_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_STORAGE_SUPABASE_PUBLISHABLE_KEY || process.env.STORAGE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_STORAGE_SUPABASE_ANON_KEY,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY || process.env.STORAGE_SUPABASE_SECRET_KEY || process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY,
  };
}
