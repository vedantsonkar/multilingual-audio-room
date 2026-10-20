import type { NextRequest } from "next/server";
import { joinSchema } from "@/lib/contracts";
import { checkOrigin, endpoint, guestUser, HttpError, jsonBody, rateLimit } from "@/lib/server/http";
import { newRoomCode, roomAction } from "@/lib/server/rooms";

export async function POST(request: NextRequest) {
  return endpoint(async () => {
    checkOrigin(request); const user = await guestUser();
    await rateLimit(`create:${user}`, 6);
    const { tabId, ...profile } = await jsonBody(request, joinSchema);
    for (let attempt = 0; attempt < 5; attempt++) {
      try { return await roomAction("create", newRoomCode(), user, tabId, profile); }
      catch (error: unknown) { if (!(error instanceof HttpError) || error.message !== "Room code collision.") throw error; }
    }
    throw new HttpError(503, "Could not allocate a room. Please retry.");
  });
}
