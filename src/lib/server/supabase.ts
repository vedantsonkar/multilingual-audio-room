import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "../database.types";
import { serverEnv } from "./env";

export function adminClient() {
  const env = serverEnv();
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function sessionClient() {
  const env = serverEnv();
  const store = await cookies();
  return createServerClient<Database>(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (values) => { for (const { name, value, options } of values) store.set(name, value, { ...options, sameSite: "lax", secure: process.env.NODE_ENV === "production" }); },
    },
  });
}
