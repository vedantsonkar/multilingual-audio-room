import type { NextRequest } from "next/server";
import { checkOrigin, endpoint, HttpError, ipKey, rateLimit, requireAccess } from "@/lib/server/http";
import { serverEnv } from "@/lib/server/env";
import { sessionClient } from "@/lib/server/supabase";

export async function POST(request: NextRequest) {
  return endpoint(async () => {
    checkOrigin(request); await requireAccess();
    const client = await sessionClient();
    const existing = await client.auth.getUser();
    if (!existing.data.user) {
      await rateLimit(`guest:${ipKey(request)}`, 20, 3600);
      const result = await client.auth.signInAnonymously();
      if (result.error) throw new HttpError(503, "Guest sign-in is unavailable. Check that anonymous sign-ins are enabled in Supabase.");
    }
    const { data, error } = await client.auth.getSession();
    if (error || !data.session) throw new HttpError(401, "Could not start a guest session.");
    const env = serverEnv();
    return { id: data.session.user.id, accessToken: data.session.access_token, supabaseUrl: env.SUPABASE_URL, publishableKey: env.SUPABASE_PUBLISHABLE_KEY };
  });
}
