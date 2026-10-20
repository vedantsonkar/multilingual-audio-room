import "server-only";
import { randomInt } from "node:crypto";
import { errorSchema, roomSchema, type Room } from "../contracts";
import type { Json } from "../database.types";
import { adminClient } from "./supabase";
import { HttpError } from "./http";

export function newRoomCode(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length: 8 }, () => alphabet.charAt(randomInt(alphabet.length))).join("");
}
export function roomHasEnded(startedAt: string | null): boolean { return startedAt !== null && Date.parse(startedAt) + 1_800_000 <= Date.now(); }
export async function roomAction(action: string, code: string, user: string, tab: string, profile: Json = {}): Promise<Room> {
  const { data, error } = await adminClient().rpc("room_action", { p_action: action, p_code: code, p_user: user, p_tab: tab, p_profile: profile });
  if (error) throw new HttpError(503, "Unable to update the room. Please retry.");
  const failure = errorSchema.safeParse(data);
  if (failure.success) throw new HttpError(failure.data.status ?? 400, failure.data.error);
  return roomSchema.parse(data);
}
