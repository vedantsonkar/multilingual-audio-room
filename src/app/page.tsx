import { RoomApp } from "@/components/room-app";
import { missingConfiguration } from "@/lib/server/env";
import { demoAccess } from "@/lib/server/http";
export const dynamic = "force-dynamic";
export default async function HomePage() {
  const configured = missingConfiguration().length === 0;
  return <RoomApp configured={configured} access={configured ? await demoAccess() : false} />;
}
