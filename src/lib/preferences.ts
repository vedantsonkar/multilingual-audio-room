import { profileSchema, type Profile } from "./contracts";

const KEY = "audio-room-preferences-v1";
export function readProfile(): Profile {
  const fallback: Profile = { name: "", speakingLanguage: "en", listeningLanguage: "en" };
  if (typeof window === "undefined") return fallback;
  try { const data: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null"); const result = profileSchema.safeParse(data); return result.success ? result.data : fallback; }
  catch { return fallback; }
}
export function rememberProfile(profile: Profile): void { try { localStorage.setItem(KEY, JSON.stringify(profile)); } catch { /* Calls also work when local storage is unavailable. */ } }
