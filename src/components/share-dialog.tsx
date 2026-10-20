"use client";
import { Check, Copy, Link2, UserPlus } from "lucide-react";
import { useState } from "react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";

export function ShareDialog({ code, open, onOpenChange }: { code: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");
  const link = typeof window !== "undefined" ? `${window.location.origin}/room/${code}` : `/room/${code}`;
  async function copy(value: string, key: string): Promise<void> {
    try { await navigator.clipboard.writeText(value); setCopied(key); setError(""); }
    catch { setError("Clipboard unavailable. Select the code or link and copy it manually."); }
  }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="bg-card sm:max-w-md">
    <DialogHeader><div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-secondary text-primary"><UserPlus className="size-5" /></div><DialogTitle className="text-2xl tracking-tight">Good conversations take two.</DialogTitle><DialogDescription>Share your room code or invite link. Your guest will also need the demo access code.</DialogDescription></DialogHeader>
    <div className="my-2 flex items-center gap-2 rounded-xl border bg-background p-3"><Input aria-label="Room code" value={code} readOnly className="h-12 border-0 bg-transparent text-center font-mono text-2xl tracking-[0.18em] shadow-none md:text-2xl" /><Button variant="secondary" size="icon-lg" aria-label="Copy room code" onClick={() => { void copy(code, "code"); }}>{copied === "code" ? <Check /> : <Copy />}</Button></div>
    <div className="flex min-w-0 items-center gap-2"><Input readOnly aria-label="Invite link" value={link} className="min-w-0 bg-background text-sm" /><Button variant="outline" onClick={() => { void copy(link, "link"); }}>{copied === "link" ? <Check /> : <Link2 />}Copy link</Button></div>
    <p aria-live="polite" className="text-xs text-muted-foreground">{error || (copied ? "Copied. Ready to share." : "Just two people. No accounts needed.")}</p>
    <Button className="mt-2 h-11" onClick={() => onOpenChange(false)}>Back to conversation</Button>
  </DialogContent></Dialog>;
}
