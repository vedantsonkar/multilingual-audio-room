import { GoogleGenAI, Modality } from "@google/genai";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { codeSchema, joinSchema, profileSchema, tabSchema } from "@/lib/contracts";
import { serverEnv } from "@/lib/server/env";
import { checkOrigin, endpoint, guestUser, HttpError, jsonBody, rateLimit } from "@/lib/server/http";
import { roomAction } from "@/lib/server/rooms";

export const runtime = "nodejs";
const actions = z.enum(["join", "state", "heartbeat", "settings", "wait", "leave", "token"]);
type Context = { params: Promise<{ code: string; action: string }> };
export async function POST(request: NextRequest, context: Context) {
  return endpoint(async () => {
    checkOrigin(request); const user = await guestUser();
    const params = await context.params;
    const code = codeSchema.parse(params.code); const action = actions.parse(params.action);
    const body = await jsonBody(request, z.object({ tabId: tabSchema }).passthrough());
    await rateLimit(`room:${user}`, 150);
    if (action === "join") {
      await rateLimit(`join:${user}`, 20);
      const { tabId, ...profile } = joinSchema.parse(body);
      return roomAction(action, code, user, tabId, profile);
    }
    if (action === "settings") {
      const profile = profileSchema.extend({ muted: z.boolean() }).parse(body);
      return roomAction(action, code, user, body.tabId, profile);
    }
    if (action !== "token") return roomAction(action, code, user, body.tabId);
    await rateLimit(`token:${user}`, 6);
    await rateLimit(`token-hour:${user}`, 80, 3600);
    const room = await roomAction("state", code, user, body.tabId);
    const member = room.members.find((member) => member.id === user);
    if (!member || room.members.length !== 2 || !room.endsAt) throw new HttpError(409, "Translation starts when both participants join.");
    const now = Date.now();
    const expiresAt = new Date(Math.min(now + 10 * 60_000, Date.parse(room.endsAt))).toISOString();
    const client = new GoogleGenAI({ apiKey: serverEnv().GEMINI_API_KEY, httpOptions: { apiVersion: "v1beta", timeout: 15_000 } });
    const token = await client.authTokens.create({ config: {
      uses: 1, expireTime: expiresAt, newSessionExpireTime: new Date(Math.min(now + 60_000, Date.parse(expiresAt))).toISOString(),
      liveConnectConstraints: { model: "gemini-3.5-live-translate-preview", config: {
        responseModalities: [Modality.AUDIO], inputAudioTranscription: {}, outputAudioTranscription: {},
        translationConfig: { targetLanguageCode: member.listeningLanguage, echoTargetLanguage: true },
      } },
    } });
    if (!token.name) throw new HttpError(503, "Translation could not start. Please retry.");
    return { token: token.name, expiresAt, language: member.listeningLanguage };
  });
}
