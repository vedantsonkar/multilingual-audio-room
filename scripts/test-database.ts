import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";

// PostgreSQL-compatible test harness. These schemas are supplied by Supabase in production.
export async function testDatabase(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
    create schema realtime; create table realtime.messages (extension text);
    alter table realtime.messages enable row level security;
    grant usage on schema realtime to authenticated;
    grant select, insert on realtime.messages to authenticated;
    create function realtime.topic() returns text language sql stable as
      $$ select current_setting('realtime.topic', true) $$;
  `);
  for (const file of (await readdir("supabase/migrations")).filter((file) => file.endsWith(".sql")).sort()) {
    await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
  }
  return db;
}
