"use client";
import { ArrowRight, Headphones, Languages, LoaderCircle, Mic } from "lucide-react";
import { useState, type FormEvent } from "react";
import { profileSchema, type Profile } from "@/lib/contracts";
import { LanguagePicker } from "./language-picker";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

interface Props { open: boolean; onOpenChange: (open: boolean) => void; initial: Profile; mode: "create" | "join" | "settings"; onSubmit: (profile: Profile) => Promise<void>; }
export function ProfileDialog({ open, onOpenChange, initial, mode, onSubmit }: Props) {
  const [profile, setProfile] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [nameError, setNameError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault(); const parsed = profileSchema.safeParse(profile);
    if (!parsed.success) { setNameError(parsed.error.issues[0]?.message ?? "Check your details."); return; }
    setPending(true); setError(""); setNameError("");
    try { await onSubmit(parsed.data); } catch (error: unknown) { setError(error instanceof Error ? error.message : "Could not continue. Please retry."); }
    finally { setPending(false); }
  }
  return <Dialog open={open} onOpenChange={(next) => { if (!pending) onOpenChange(next); }}><DialogContent className="max-h-[90dvh] overflow-y-auto bg-card sm:max-w-md">
    <DialogHeader><div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-secondary text-primary"><Languages className="size-5" /></div>
      <DialogTitle className="text-2xl font-semibold tracking-tight">{mode === "settings" ? "Make yourself understood." : "Come as you are."}</DialogTitle>
      <DialogDescription>{mode === "settings" ? "Your preferences, your conversation." : "A name and two languages. That’s all you need."}</DialogDescription>
    </DialogHeader>
    <form onSubmit={(event) => { void submit(event); }} className="mt-2 space-y-5">
      <div className="space-y-2"><Label htmlFor="guest-name">Your name</Label><Input id="guest-name" value={profile.name} onChange={(event) => { setProfile({ ...profile, name: event.target.value }); setNameError(""); }} maxLength={40} autoComplete="given-name" placeholder="What should we call you?" className="h-12 bg-background text-base" aria-invalid={Boolean(nameError)} aria-describedby={nameError ? "name-error" : undefined} />{nameError && <p id="name-error" className="text-sm text-destructive">{nameError}</p>}</div>
      <div className="space-y-2"><Label htmlFor="speaking-language"><Mic className="size-3.5" /> I usually speak</Label><LanguagePicker id="speaking-language" value={profile.speakingLanguage} onChange={(speakingLanguage) => setProfile({ ...profile, speakingLanguage })} /><p className="text-xs leading-relaxed text-muted-foreground">Switch languages naturally. We detect what you’re speaking.</p></div>
      <div className="space-y-2"><Label htmlFor="listening-language"><Headphones className="size-3.5" /> I want to listen in</Label><LanguagePicker id="listening-language" value={profile.listeningLanguage} onChange={(listeningLanguage) => setProfile({ ...profile, listeningLanguage })} /></div>
      {error && <p role="alert" className="rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
      <p className="text-xs leading-relaxed text-muted-foreground">{mode === "settings" ? "Changing your listening language briefly reconnects translation." : "Your microphone is shared with the other guest and processed by Google Gemini for live translation. Calls aren’t recorded. Headphones work best."}</p>
      <Button type="submit" disabled={pending} className="h-12 w-full text-base">{pending ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" /> : mode === "settings" ? "Save preferences" : mode === "create" ? "Create & join room" : "Join room"}{!pending && <ArrowRight className="size-4" />}</Button>
      <p className="text-center text-xs text-muted-foreground">Preferences stay in this browser. Change them whenever you like.</p>
    </form>
  </DialogContent></Dialog>;
}
