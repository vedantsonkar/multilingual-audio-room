import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Page, WebSocketRoute } from "@playwright/test";
import { joinSchema, profileSchema, type Member, type Room } from "../../src/lib/contracts";

type Socket = { ws: WebSocketRoute; topic: string; joinRef: string | null };
interface PhoenixMessage { joinRef: string | null; ref: string | null; topic: string; event: string; payload: unknown; }
const phoenixSchema = z.tuple([z.string().nullable(), z.string().nullable(), z.string(), z.string(), z.unknown()]);
function phoenix(message: string | Buffer): PhoenixMessage {
  if (typeof message === "string") {
    const raw: unknown = JSON.parse(message); const [joinRef, ref, topic, event, payload] = phoenixSchema.parse(raw);
    return { joinRef, ref, topic, event, payload };
  }
  if (message[0] !== 3) throw new Error("Unexpected mock signaling frame");
  const sizes = [message[1] ?? 0, message[2] ?? 0, message[3] ?? 0, message[4] ?? 0, message[5] ?? 0];
  let offset = 7;
  const parts = sizes.map((size) => { const text = message.subarray(offset, offset + size).toString("utf8"); offset += size; return text; });
  const payload: unknown = JSON.parse(message.subarray(offset).toString("utf8"));
  return { joinRef: parts[0] || null, ref: parts[1] || null, topic: parts[2] ?? "", event: "broadcast", payload: { type: "broadcast", event: parts[3], payload } };
}

// Only providers are simulated. Browser microphone capture, AudioWorklets,
// WebRTC negotiation, data channels, audio playback and application code are real.
export class MockServices {
  readonly members = new Map<string, Member>();
  readonly code = "TEST1234";
  epoch = randomUUID();
  aloneSince: string | null = new Date().toISOString();
  endsAt: string | null = null;
  tokenRequests = 0;
  audioChunks = 0;
  nonSilentAudioChunks = 0;
  readonly nonSilentByListener = new Map<string, number>();
  failTranslation = false;
  rejectJoin = false;
  private sockets = new Set<Socket>();
  snapshot(): Room { return { code: this.code, epoch: this.epoch, serverNow: new Date().toISOString(), aloneSince: this.aloneSince, endsAt: this.endsAt, members: [...this.members.values()] }; }
  async attach(page: Page, id: string): Promise<void> {
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      const raw: unknown = route.request().postDataJSON();
      const body = z.record(z.string(), z.unknown()).parse(raw);
      const reply = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
      if (url.pathname === "/api/access") return reply(body.code === "test-demo-code" ? { ok: true } : { error: "That access code isn’t correct." }, body.code === "test-demo-code" ? 200 : 401);
      if (url.pathname === "/api/guest") {
        const jwt = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600, role: "authenticated" })).toString("base64url")}.test`;
        return reply({ id, accessToken: jwt, supabaseUrl: "https://example.supabase.co", publishableKey: "sb_publishable_test" });
      }
      if (url.pathname === "/api/rooms" || url.pathname.endsWith("/join")) {
        if (this.rejectJoin) return reply({ error: "This room is full. Only two people can join." }, 409);
        const profile = profileSchema.parse(joinSchema.parse(body));
        this.members.set(id, { ...profile, id, muted: false }); this.epoch = randomUUID();
        if (this.members.size === 2) { this.aloneSince = null; this.endsAt ??= new Date(Date.now() + 1_800_000).toISOString(); }
        return reply(this.snapshot());
      }
      if (url.pathname.endsWith("/settings")) {
        const member = this.members.get(id); if (member) this.members.set(id, { ...member, ...profileSchema.parse(body), muted: z.boolean().parse(body.muted) });
      }
      if (url.pathname.endsWith("/wait")) this.aloneSince = new Date().toISOString();
      if (url.pathname.endsWith("/leave")) { this.members.delete(id); this.epoch = randomUUID(); this.aloneSince = new Date().toISOString(); }
      if (url.pathname.endsWith("/token")) {
        this.tokenRequests++;
        if (this.failTranslation) return reply({ error: "Translation quota reached." }, 503);
        return reply({ token: "auth_tokens/mock", expiresAt: new Date(Date.now() + 600_000).toISOString(), language: this.members.get(id)?.listeningLanguage ?? "en" });
      }
      return reply(this.snapshot());
    });
    await page.routeWebSocket("wss://example.supabase.co/**", (ws) => {
      const socket: Socket = { ws, topic: "", joinRef: null }; this.sockets.add(socket);
      ws.onClose(() => this.sockets.delete(socket));
      ws.onMessage((raw) => {
        const message = phoenix(raw);
        if (message.event === "phx_join") { socket.topic = message.topic; socket.joinRef = message.joinRef; }
        ws.send(JSON.stringify([message.joinRef, message.ref, message.topic, "phx_reply", { status: "ok", response: {} }]));
        if (message.event === "broadcast") for (const other of this.sockets) {
          if (other !== socket && other.topic === socket.topic) other.ws.send(JSON.stringify([other.joinRef, null, message.topic, "broadcast", message.payload]));
        }
        if (message.event === "phx_leave") { socket.topic = ""; this.sockets.delete(socket); }
      });
    });
    await page.routeWebSocket("wss://generativelanguage.googleapis.com/**", (ws) => {
      let audio = 0; let line = 0;
      ws.onMessage((raw) => {
        const data: unknown = JSON.parse(String(raw));
        const message = z.object({ setup: z.unknown().optional(), realtimeInput: z.object({ audio: z.object({ data: z.string() }).optional() }).optional() }).parse(data);
        if (message.setup) { ws.send(JSON.stringify({ setupComplete: { sessionId: "test" } })); return; }
        if (!message.realtimeInput?.audio) return;
        this.audioChunks++; audio++;
        const pcm = Buffer.from(message.realtimeInput.audio.data, "base64");
        for (let index = 0; index + 1 < pcm.length; index += 2) {
          if (Math.abs(pcm.readInt16LE(index)) > 100) { this.nonSilentAudioChunks++; this.nonSilentByListener.set(id, (this.nonSilentByListener.get(id) ?? 0) + 1); break; }
        }
        if (audio % 10 !== 0) return;
        const member = this.members.get(id); line++;
        const translated = member?.listeningLanguage === "hi" ? `आपसे बात करके अच्छा लगा। ${line}` : `It’s lovely to talk to you. ${line}`;
        ws.send(JSON.stringify({ serverContent: {
          inputTranscription: { text: `Hello from the other speaker. ${line}`, finished: true },
          outputTranscription: { text: translated, finished: true },
          modelTurn: { parts: [{ inlineData: { data: Buffer.alloc(4800).toString("base64"), mimeType: "audio/pcm;rate=24000" } }] }, turnComplete: true,
        } }));
      });
    });
  }
}

export async function enterCall(page: Page, name: string, create = true): Promise<void> {
  await page.goto("/");
  if (!create) await page.getByRole("textbox", { name: "Room code", exact: true }).fill("TEST1234");
  await page.getByRole("button", { name: create ? "Create a room" : "Join", exact: true }).click();
  await page.getByLabel("Demo access code").fill("test-demo-code");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Your name", { exact: true }).fill(name);
  await page.getByRole("button", { name: create ? "Create & join room" : "Join room", exact: true }).click();
  await page.getByRole("button", { name: "Back to conversation" }).click();
}
