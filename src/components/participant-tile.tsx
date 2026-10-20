import { Mic, MicOff, UserPlus } from "lucide-react";
import type { Member } from "@/lib/contracts";
import { languageName } from "@/lib/languages";
import { cn } from "@/lib/utils";
export function ParticipantTile({ member, self, speaking, onInvite }: { member?: Member | undefined; self?: boolean; speaking: boolean; onInvite: () => void }) {
  if (!member) return <button onClick={onInvite} className="flex min-h-0 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed bg-secondary/40 p-4 text-muted-foreground hover:border-primary hover:bg-secondary"><span className="flex size-12 items-center justify-center rounded-full border bg-card sm:size-16"><UserPlus className="size-5" /></span><span className="text-sm">Invite your guest</span><span className="hidden text-xs min-[400px]:block">One open seat</span></button>;
  const initials = member.name.trim().split(/\s+/u).slice(0, 2).map((word) => Array.from(word)[0] ?? "").join("").toLocaleUpperCase();
  return <section aria-label={`${member.name}${self ? ", you" : ""}${speaking && !member.muted ? ", speaking" : ""}`} className={cn("participant-tile relative flex min-h-0 flex-col items-center justify-center overflow-hidden rounded-2xl border-2 bg-secondary p-3 transition-colors motion-reduce:transition-none sm:p-5", speaking && !member.muted ? "border-primary" : "border-transparent")}>
    <div className={cn("participant-avatar flex size-14 shrink-0 items-center justify-center rounded-full text-xl font-medium sm:size-20 sm:text-2xl", self ? "bg-card text-primary" : "bg-primary text-primary-foreground")}>{initials}</div>
    <div className="participant-name mt-3 w-full text-center"><p className="truncate text-sm font-medium">{member.name}{self && <span className="ml-1 font-normal text-muted-foreground">(you)</span>}</p><p className="participant-language mt-1 truncate text-[11px] text-muted-foreground">{languageName(member.speakingLanguage)} → {languageName(member.listeningLanguage)}</p></div>
    <span className="absolute top-3 right-3 rounded-full bg-card p-1.5 text-muted-foreground">{member.muted ? <MicOff className="size-3" /> : <Mic className={cn("size-3", speaking && "text-primary")} />}</span>
  </section>;
}
