import { AudioLines } from "lucide-react";
import { cn } from "@/lib/utils";

export function AudioActivity({ active, className }: { active: boolean; className?: string }) {
  return <AudioLines aria-hidden="true" data-testid="audio-activity" data-active={active} className={cn("audio-activity size-5 shrink-0", active ? "text-primary" : "text-muted-foreground", className)} />;
}
