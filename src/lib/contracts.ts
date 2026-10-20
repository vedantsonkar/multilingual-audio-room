import { z } from "zod";
import { LANGUAGE_CODES, type LanguageCode } from "./languages";

export const languageSchema = z.custom<LanguageCode>((value: unknown) => typeof value === "string" && LANGUAGE_CODES.has(value), "Choose a supported language");
export const profileSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(40, "Use 40 characters or fewer"),
  speakingLanguage: languageSchema,
  listeningLanguage: languageSchema,
});
export type Profile = z.infer<typeof profileSchema>;
export const codeSchema = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{8}$/, "Enter the 8-character room code");
export const tabSchema = z.uuid();
export const joinSchema = profileSchema.extend({ tabId: tabSchema });
export const memberSchema = profileSchema.extend({ id: z.uuid(), muted: z.boolean() });
export type Member = z.infer<typeof memberSchema>;
export const roomSchema = z.object({
  code: codeSchema,
  epoch: z.uuid(),
  serverNow: z.iso.datetime({ offset: true }),
  aloneSince: z.iso.datetime({ offset: true }).nullable(),
  endsAt: z.iso.datetime({ offset: true }).nullable(),
  members: z.array(memberSchema).max(2),
});
export type Room = z.infer<typeof roomSchema>;
export const guestSchema = z.object({ id: z.uuid(), accessToken: z.string(), supabaseUrl: z.url(), publishableKey: z.string() });
export type Guest = z.infer<typeof guestSchema>;
export const tokenSchema = z.object({ token: z.string(), expiresAt: z.string(), language: languageSchema });
export const errorSchema = z.object({ error: z.string(), status: z.number().optional() });
export const signalSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("description"), from: z.uuid(), epoch: z.uuid(), description: z.object({ type: z.enum(["offer", "answer"]), sdp: z.string().max(100_000) }) }),
  z.object({ type: z.literal("ice"), from: z.uuid(), epoch: z.uuid(), candidate: z.object({ candidate: z.string().max(4096), sdpMid: z.string().nullable().optional(), sdpMLineIndex: z.number().nullable().optional(), usernameFragment: z.string().nullable().optional() }) }),
  z.object({ type: z.literal("ready"), from: z.uuid(), epoch: z.uuid() }),
]);
export type Signal = z.infer<typeof signalSchema>;
export const captionSchema = z.object({ type: z.literal("caption"), id: z.string().max(100), text: z.string().max(12_000), final: z.boolean() });
export interface TranscriptEntry { id: string; speakerId: string; original: string; translated: string; createdAt: number; }

export function latestEntriesBySpeaker(entries: readonly TranscriptEntry[]): Map<string, string> {
  const latest = new Map<string, string>();
  for (const entry of entries) latest.set(entry.speakerId, entry.id);
  return latest;
}
