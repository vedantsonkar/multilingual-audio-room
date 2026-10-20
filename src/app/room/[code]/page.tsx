import { RoomApp } from "@/components/room-app";
import { codeSchema } from "@/lib/contracts";
import { missingConfiguration } from "@/lib/server/env";
import { demoAccess } from "@/lib/server/http";
import { adminClient } from "@/lib/server/supabase";
import { roomHasEnded } from "@/lib/server/rooms";
export const dynamic = "force-dynamic";
export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const parsed = codeSchema.safeParse((await params).code);
  const configured = missingConfiguration().length === 0;
  const access = configured ? await demoAccess() : false;
  let notice = parsed.success ? "" : "That room code isn’t valid.";
  if (access && parsed.success) {
    const { data, error } = await adminClient().from("rooms").select("closed_at, started_at").eq("code", parsed.data).maybeSingle();
    if (error) notice = "Unable to check this room right now. Please retry.";
    else if (!data) notice = "Room not found. Check your invite link.";
    else if (data.closed_at || roomHasEnded(data.started_at)) notice = "This room has ended. Create a new room.";
  }
  return <RoomApp configured={configured} access={access} inviteCode={parsed.success ? parsed.data : ""} roomNotice={notice} />;
}
