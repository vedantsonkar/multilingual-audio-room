"use client";
import { AudioLines, Captions, Check, Copy, Headphones, Mic, MicOff, PhoneOff, RotateCcw, Settings2, UserPlus, Volume2, Clock3 } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { CallController, type ActiveCall } from "@/lib/call-controller";
import { rememberProfile } from "@/lib/preferences";
import { cn } from "@/lib/utils";
import { ProfileDialog } from "./profile-dialog";
import { ShareDialog } from "./share-dialog";
import { Transcript } from "./transcript";
import { ParticipantTile } from "./participant-tile";
import { ThemeButton } from "./theme-button";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Slider } from "./ui/slider";

function duration(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000)); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
export function CallView({ call, onEnd }: { call: ActiveCall; onEnd: (message: string) => void }) {
  const [controller] = useState(() => new CallController(call, onEnd));
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => controller.attach(), [controller]);
  const [shareOpen, setShareOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [captionsVisible, setCaptionsVisible] = useState(true);
  const self = state.room.members.find((member) => member.id === call.guest.id);
  const peer = state.room.members.find((member) => member.id !== call.guest.id);
  const aloneElapsed = state.room.aloneSince ? state.now - Date.parse(state.room.aloneSince) : 0;
  const endsIn = state.room.endsAt ? Date.parse(state.room.endsAt) - state.now : null;
  const warning = aloneElapsed >= 60_000 && state.room.members.length === 1;
  const translationProblem = ["error", "retrying", "original"].includes(state.translation);
  return <main className="call-shell flex flex-col bg-background">
    <header className="flex shrink-0 items-center justify-between gap-2 px-4 py-3 sm:px-7 sm:py-4">
      <div className="flex items-center gap-2"><AudioLines className="size-6 text-primary" /><span className="text-lg font-semibold tracking-tight">common<span className="text-primary">.</span></span><span className="ml-3 hidden text-xs text-muted-foreground sm:block">A little closer, in every language.</span></div>
      <div className="flex items-center gap-1.5"><Button variant="outline" size="sm" className="gap-2 rounded-full bg-card font-mono tracking-wider" onClick={() => setShareOpen(true)} aria-label={`Room code ${state.room.code}. Open invite`} title="Open room code and invite"><span className="hidden min-[360px]:inline">{state.room.code}</span><Copy className="size-3.5" /></Button><ThemeButton /></div>
    </header>
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-5 pb-3 text-xs sm:px-8">
      <div className="flex min-w-0 items-center gap-2"><span className={cn("size-1.5 shrink-0 rounded-full", state.connection === "Connected" ? "bg-primary" : "bg-muted-foreground")} /><span className="truncate text-muted-foreground">{state.connection}</span>{peer && state.connection !== "Connected" && <Button variant="ghost" size="xs" onClick={() => { void controller.reconnect(); }}><RotateCcw className="size-3" />Reconnect</Button>}</div>
      <span className="flex items-center gap-1.5 text-muted-foreground"><Clock3 className="size-3" />{endsIn !== null ? `${duration(endsIn)} left` : "30-minute room"}</span>
    </div>
    {(state.error || state.audioSuspended || (endsIn !== null && endsIn <= 120_000)) && <div className="mx-4 mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-4 py-2 text-xs sm:mx-7" role="status"><span>{state.audioSuspended ? "Tap to enable call audio." : state.error || "Two minutes left. This room will close at the end of the call."}</span>{state.audioSuspended && <Button size="sm" onClick={() => { void controller.resumeAudio(); }}><Headphones />Enable audio</Button>}</div>}
    {peer && <div className="mx-4 mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2 text-xs sm:mx-7"><span className="flex items-center gap-2 text-muted-foreground"><LanguagesMark live={state.translation === "live"} />{state.translationMessage}</span>{translationProblem && <div className="flex flex-wrap gap-1"><Button size="xs" variant="outline" onClick={() => { void controller.retry(); }}><RotateCcw className="size-3" />Retry translation</Button>{state.translation !== "original" && <Button size="xs" variant="ghost" onClick={() => { void controller.listenOriginal(); }}>Listen to original</Button>}</div>}</div>}
    <div className="call-grid min-h-0 flex-1 gap-3 px-3 sm:gap-4 sm:px-7">
      {captionsVisible ? <Transcript entries={state.entries} members={state.knownMembers} selfId={call.guest.id} listeningLanguage={self?.listeningLanguage ?? "en"} /> : <section className="flex min-h-0 flex-col items-center justify-center gap-3 rounded-2xl border bg-card"><Captions className="size-7 text-muted-foreground" /><p className="text-sm text-muted-foreground">Transcript hidden</p><Button variant="outline" size="sm" onClick={() => setCaptionsVisible(true)}>Show transcript</Button></section>}
      <div className="participant-grid min-h-0 gap-3 sm:gap-4" aria-label="Participants"><ParticipantTile member={self ? { ...self, muted: state.muted } : undefined} self speaking={state.speaking[call.guest.id] ?? false} onInvite={() => setShareOpen(true)} /><ParticipantTile member={peer} speaking={peer ? state.speaking[peer.id] ?? false : false} onInvite={() => setShareOpen(true)} /></div>
    </div>
    <footer className="flex shrink-0 flex-wrap items-center justify-center gap-2 px-3 py-4 sm:gap-3 sm:py-5" aria-label="Call controls">
      <Button size="icon-lg" variant={state.muted ? "destructive" : "secondary"} className="size-12 rounded-full" aria-label={state.muted ? "Unmute microphone" : "Mute microphone"} aria-pressed={state.muted} title={state.muted ? "Unmute microphone" : "Mute microphone"} onClick={() => { void controller.toggleMute(); }}>{state.muted ? <MicOff className="size-5" /> : <Mic className="size-5" />}</Button>
      <Button size="icon-lg" variant={captionsVisible ? "secondary" : "outline"} className="size-12 rounded-full" aria-label={captionsVisible ? "Hide transcript" : "Show transcript"} aria-pressed={captionsVisible} title="Toggle transcript" onClick={() => setCaptionsVisible(!captionsVisible)}><Captions className="size-5" /></Button>
      <Popover><PopoverTrigger asChild><Button size="icon-lg" variant="secondary" className="size-12 rounded-full" aria-label="Listening volume" title="Listening volume"><Volume2 className="size-5" /></Button></PopoverTrigger><PopoverContent side="top" className="w-56 bg-card"><p className="mb-4 text-sm font-medium">Listening volume · {Math.round(state.volume * 100)}%</p><Slider aria-label="Listening volume" min={0} max={1} step={0.05} value={[state.volume]} onValueChange={(values) => controller.setVolume(values[0] ?? 0)} /></PopoverContent></Popover>
      {state.room.members.length < 2 && <Button size="icon-lg" variant="secondary" className="size-12 rounded-full" aria-label="Invite a guest" title="Invite a guest" onClick={() => setShareOpen(true)}><UserPlus className="size-5" /></Button>}
      <Button size="icon-lg" variant="secondary" className="size-12 rounded-full" aria-label="Call preferences" title="Call preferences" onClick={() => setSettingsOpen(true)}><Settings2 className="size-5" /></Button>
      <span className="mx-1 h-7 w-px bg-border" />
      <Button variant="destructive" className="h-12 rounded-full px-5" aria-label="Leave call" onClick={() => { void controller.leave(); }}><PhoneOff className="size-5" /><span className="hidden sm:inline">Leave</span></Button>
    </footer>
    <ShareDialog code={state.room.code} open={shareOpen} onOpenChange={setShareOpen} />
    {self && settingsOpen && <ProfileDialog open={settingsOpen} onOpenChange={setSettingsOpen} initial={self} mode="settings" onSubmit={async (profile) => { await controller.saveProfile(profile); rememberProfile(profile); setSettingsOpen(false); }} />}
    <Dialog open={warning && !shareOpen && !settingsOpen}><DialogContent showCloseButton={false} onEscapeKeyDown={(event) => event.preventDefault()} onPointerDownOutside={(event) => event.preventDefault()} className="bg-card sm:max-w-md"><DialogHeader><DialogTitle className="text-xl">Are you still waiting?</DialogTitle><DialogDescription>You’re the only one here. Choose Wait to keep your room open for another two minutes.</DialogDescription></DialogHeader><p className="py-4 text-center font-mono text-4xl tabular-nums" aria-live="off">{duration(120_000 - aloneElapsed)}</p><div className="flex gap-3"><Button variant="outline" className="flex-1" onClick={() => { void controller.leave(); }}>Leave</Button><Button className="flex-1" onClick={() => { void controller.wait(); }}>Wait</Button></div></DialogContent></Dialog>
  </main>;
}
function LanguagesMark({ live }: { live: boolean }) { return live ? <Check className="size-3.5 text-primary" /> : <AudioLines className="size-3.5" />; }
