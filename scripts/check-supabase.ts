import { createClient } from "@supabase/supabase-js";
import { loadLocalEnv } from "./load-local-env";

loadLocalEnv();
const url = process.env.SUPABASE_URL || process.env.STORAGE_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.STORAGE_SUPABASE_SECRET_KEY || process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY;
const publishable = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.STORAGE_SUPABASE_PUBLISHABLE_KEY || process.env.STORAGE_SUPABASE_ANON_KEY;
if (!url || !key || !publishable) throw new Error("Supabase configuration is missing.");
const response = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: publishable } });
const settings: unknown = await response.json();
console.log("Supabase auth settings reachable:", response.ok);
const anonymous = typeof settings === "object" && settings !== null && "external" in settings && typeof settings.external === "object" && settings.external !== null && "anonymous_users" in settings.external && settings.external.anonymous_users === true;
console.log("Anonymous sign-in enabled:", anonymous);
const client = createClient(url, key, { auth: { persistSession: false } });
const table = await client.from("rooms").select("code").limit(0);
console.log("Rooms schema available:", !table.error, table.error?.code ?? "ok");
const rpc = await client.rpc("room_action", { p_action: "state", p_code: "CHECK000", p_user: "00000000-0000-4000-8000-000000000001", p_tab: "00000000-0000-4000-8000-000000000002" });
console.log("Room RPC available:", !rpc.error, rpc.error?.code ?? "ok");
if (!response.ok || !anonymous || table.error || rpc.error) process.exitCode = 1;
