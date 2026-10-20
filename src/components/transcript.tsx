"use client";
import { ArrowDown, Languages, MessageCircle } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { latestEntriesBySpeaker, type Member, type TranscriptEntry } from "@/lib/contracts";
import { languageName } from "@/lib/languages";
import { Button } from "./ui/button";

export function Transcript({ entries, members, selfId, listeningLanguage }: { entries: TranscriptEntry[]; members: Member[]; selfId: string; listeningLanguage: string }) {
  const scroller = useRef<HTMLDivElement>(null); const follow = useRef(true);
  const [paused, setPaused] = useState(false);
  const latest = latestEntriesBySpeaker(entries);
  useLayoutEffect(() => {
    const node = scroller.current;
    if (follow.current && node) node.scrollTop = node.scrollHeight;
  }, [entries]);
  function jump(): void { follow.current = true; setPaused(false); const node = scroller.current; if (node) node.scrollTop = node.scrollHeight; }
  return <section className="relative flex min-h-0 flex-col overflow-hidden rounded-2xl border bg-card" aria-label="Live transcript">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-4"><h1 className="flex items-center gap-2 text-sm font-medium"><MessageCircle className="size-4 text-primary" /> The conversation</h1><span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Languages className="size-3.5" />{languageName(listeningLanguage)}</span></div>
    <div ref={scroller} className="min-h-0 flex-1 space-y-7 overflow-y-auto overscroll-contain px-5 py-6 sm:px-8 sm:py-8" onScroll={() => { const node = scroller.current; if (!node) return; const atBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 64; follow.current = atBottom; setPaused(!atBottom); }}>
      {entries.length === 0 ? <div className="flex h-full min-h-32 flex-col items-center justify-center text-center"><div className="mb-4 flex size-12 items-center justify-center rounded-full bg-secondary"><Languages className="size-5 text-primary" /></div><h2 className="text-lg font-medium tracking-tight">Every word, a little closer.</h2><p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">Start speaking when you’re both here. Your live conversation will appear in this space.</p></div> : entries.map((entry) => {
        const self = entry.speakerId === selfId; const member = members.find((member) => member.id === entry.speakerId);
        return <article key={entry.id} data-testid="transcript-entry" data-speaker={entry.speakerId} className="transcript-line" style={{ opacity: latest.get(entry.speakerId) === entry.id ? 1 : 0.7 }}>
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground"><span className={`inline-block size-1.5 rounded-full ${self ? "bg-muted-foreground" : "bg-primary"}`} /><span className="max-w-64 truncate">{self ? "You" : member?.name ?? "Your guest"}</span><span className="font-normal">{self ? "original" : "translated"}</span></div>
          <p dir="auto" className="break-words text-xl leading-relaxed font-normal tracking-tight text-foreground sm:text-2xl">{self ? entry.original : entry.translated || "Translating…"}</p>
          {!self && entry.original && <details className="mt-2 text-sm text-muted-foreground"><summary className="w-fit cursor-pointer select-none text-xs hover:text-foreground">Original</summary><p dir="auto" className="mt-2 break-words leading-relaxed">{entry.original}</p></details>}
        </article>;
      })}
    </div>
    {paused && <div className="absolute inset-x-0 bottom-4 flex justify-center"><Button size="sm" className="rounded-full shadow-md" onClick={jump}><ArrowDown className="size-3.5" />Jump to live</Button></div>}
    <div className="border-t px-5 py-2.5 text-[11px] text-muted-foreground">Live captions may contain mistakes. Nothing here is recorded.</div>
  </section>;
}
