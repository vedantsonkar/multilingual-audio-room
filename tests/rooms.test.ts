import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { testDatabase } from "../scripts/test-database";
import { roomSchema, errorSchema } from "../src/lib/contracts";

let db: PGlite;
const users = ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002", "00000000-0000-4000-8000-000000000003"] as const;
const tabs = ["10000000-0000-4000-8000-000000000001", "10000000-0000-4000-8000-000000000002", "10000000-0000-4000-8000-000000000003"] as const;
const profile = { name: "Guest", speakingLanguage: "hi", listeningLanguage: "en" };
async function action(action: string, user: string = users[0], tab: string = tabs[0], code = "ABCD1234"): Promise<unknown> {
  const result = await db.query<{ value: unknown }>("select public.room_action($1, $2, $3, $4, $5::jsonb) as value", [action, code, user, tab, JSON.stringify(profile)]);
  return result.rows[0]?.value;
}
beforeAll(async () => { db = await testDatabase(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.exec("truncate public.rooms, public.room_members, public.request_buckets, auth.users cascade");
  for (const user of users) await db.query("insert into auth.users(id) values ($1)", [user]);
});
describe("transactional room lifecycle", () => {
  it("creates one seat, joins a second and rejects the third", async () => {
    const first = roomSchema.parse(await action("create")); expect(first.members).toHaveLength(1); expect(first.aloneSince).not.toBeNull(); expect(first.endsAt).toBeNull();
    const second = roomSchema.parse(await action("join", users[1], tabs[1])); expect(second.members).toHaveLength(2); expect(second.aloneSince).toBeNull(); expect(second.endsAt).not.toBeNull(); expect(second.epoch).not.toBe(first.epoch);
    expect(errorSchema.parse(await action("join", users[2], tabs[2])).status).toBe(409);
  });
  it("makes joins idempotent and prevents duplicate tabs and cross-room occupancy", async () => {
    const room = roomSchema.parse(await action("create"));
    expect(roomSchema.parse(await action("join")).epoch).toBe(room.epoch);
    expect(errorSchema.parse(await action("join", users[0], tabs[2])).status).toBe(409);
    expect(errorSchema.parse(await action("create", users[0], tabs[0], "EFGH5678")).status).toBe(409);
  });
  it("linearizes competing joins and retains the original call deadline after rejoin", async () => {
    await action("create");
    const results = await Promise.all([action("join", users[1], tabs[1]), action("join", users[2], tabs[2])]);
    expect(results.filter((value) => roomSchema.safeParse(value).success)).toHaveLength(1);
    const before = roomSchema.parse(await action("state"));
    await action("leave", users[1], tabs[1]);
    const after = roomSchema.parse(await action("join", users[1], tabs[1]));
    expect(after.endsAt).toBe(before.endsAt);
  });
  it("allows rejoining an empty room inside 30 seconds, rejects after expiry", async () => {
    await action("create"); await action("leave");
    expect(roomSchema.parse(await action("join")).members).toHaveLength(1);
    await action("leave"); await db.exec("update public.rooms set empty_since = now() - interval '31 seconds'");
    expect(errorSchema.parse(await action("join")).status).toBe(410);
    expect((await db.query<{ closed: boolean }>("select closed_at is not null as closed from public.rooms")).rows[0]?.closed).toBe(true);
  });
  it("expires crashed leases and never revives them through heartbeat", async () => {
    await action("create"); await db.exec("update public.room_members set lease_expires_at = now() - interval '1 second'");
    expect(errorSchema.parse(await action("heartbeat")).status).toBe(403);
    expect(roomSchema.parse(await action("join")).members).toHaveLength(1);
  });
  it("uses lease expiration as the empty-room start even without a running client", async () => {
    await action("create"); await db.exec("update public.room_members set lease_expires_at = now() - interval '31 seconds'");
    expect(errorSchema.parse(await action("join")).status).toBe(410);
  });
  it("resets the solo timer on Wait and cancels it when a peer joins", async () => {
    await action("create"); await db.exec("update public.rooms set alone_since = now() - interval '70 seconds'");
    const old = roomSchema.parse(await action("state")); const waited = roomSchema.parse(await action("wait"));
    expect(Date.parse(waited.aloneSince ?? "")).toBeGreaterThan(Date.parse(old.aloneSince ?? ""));
    expect(roomSchema.parse(await action("join", users[1], tabs[1])).aloneSince).toBeNull();
  });
  it("cannot extend an elapsed solo deadline and starts the 30-second empty window", async () => {
    await action("create"); await db.exec("update public.rooms set alone_since = now() - interval '121 seconds'");
    expect(errorSchema.parse(await action("wait")).status).toBe(403);
    expect(roomSchema.parse(await action("join")).members).toHaveLength(1);
  });
  it("closes at 30 minutes before renewing membership", async () => {
    await action("create"); await action("join", users[1], tabs[1]);
    await db.exec("update public.rooms set started_at = now() - interval '30 minutes'");
    expect(errorSchema.parse(await action("heartbeat")).status).toBe(410);
    expect(errorSchema.parse(await action("join", users[2], tabs[2])).status).toBe(410);
  });
  it("rejects unauthorized actions and wrong tab IDs", async () => {
    await action("create"); expect(errorSchema.parse(await action("state", users[2], tabs[2])).status).toBe(403);
    expect(errorSchema.parse(await action("settings", users[0], tabs[2])).status).toBe(403);
  });
});
describe("access isolation and shared rate limits", () => {
  it("isolates membership reads and denies direct client writes and privileged RPC", async () => {
    await action("create"); await action("join", users[1], tabs[1]);
    await db.exec(`set role authenticated; set request.jwt.claim.sub = '${users[0]}'`);
    try {
      const rows = await db.query<{ user_id: string }>("select user_id from public.room_members"); expect(rows.rows.map((row) => row.user_id)).toEqual([users[0]]);
      await expect(db.exec("delete from public.room_members")).rejects.toThrow(/permission denied/);
      await expect(action("state")).rejects.toThrow(/permission denied/);
      await db.exec(`set request.jwt.claim.sub = '${users[2]}'`);
      expect((await db.query("select * from public.rooms")).rows).toHaveLength(0);
    } finally { await db.exec("reset role"); }
  });
  it("authorizes only current members on the current signaling epoch", async () => {
    const room = roomSchema.parse(await action("create"));
    await db.exec(`insert into realtime.messages values ('broadcast'); set role authenticated; set request.jwt.claim.sub = '${users[0]}'; set realtime.topic = 'call:ABCD1234:${room.epoch}'`);
    try {
      expect((await db.query("select * from realtime.messages")).rows).toHaveLength(1);
      await db.exec("set realtime.topic = 'call:ABCD1234:wrong'"); expect((await db.query("select * from realtime.messages")).rows).toHaveLength(0);
      await db.exec(`set realtime.topic = 'call:ABCD1234:${room.epoch}'; set request.jwt.claim.sub = '${users[2]}'`); expect((await db.query("select * from realtime.messages")).rows).toHaveLength(0);
    } finally { await db.exec("reset role"); }
  });
  it("atomically caps requests and resets expired buckets", async () => {
    async function consume(): Promise<boolean | undefined> { return (await db.query<{ allowed: boolean }>("select public.consume_request('token:test', 2, 60) as allowed")).rows[0]?.allowed; }
    expect(await consume()).toBe(true); expect(await consume()).toBe(true); expect(await consume()).toBe(false);
    await db.exec("update public.request_buckets set window_start = now() - interval '1 day'"); expect(await consume()).toBe(true);
  });
});
