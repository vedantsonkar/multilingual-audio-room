"use client";
import { ChevronDown, LoaderCircle, Mic, MicOff, Volume2 } from "lucide-react";
import { useState } from "react";
import type { CallController, CallSnapshot } from "@/lib/call-controller";
import type { AudioDevice } from "@/lib/audio/devices";
import { cn } from "@/lib/utils";
import { AudioActivity } from "./audio-activity";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Slider } from "./ui/slider";

// Radix reserves the empty string for an unselected value.
const DEFAULT_DEVICE = "system-default";
function DeviceSelect({ id, value, options, disabled, onChange }: { id: string; value: string; options: readonly AudioDevice[]; disabled: boolean; onChange: (id: string) => void }) {
  const known = options.some((option) => option.id === value);
  return <Select value={value || DEFAULT_DEVICE} disabled={disabled} onValueChange={(id) => onChange(id === DEFAULT_DEVICE ? "" : id)}>
    <SelectTrigger id={id} className="w-full min-w-0 bg-background text-base data-[size=default]:h-11 sm:text-sm"><SelectValue placeholder="Choose a device" /></SelectTrigger>
    <SelectContent position="popper" className="z-60 max-w-[calc(100vw-2rem)] bg-card">
      {!known && <SelectItem value={value} disabled>Current device unavailable</SelectItem>}
      {options.map((option) => <SelectItem key={option.id} value={option.id || DEFAULT_DEVICE} className="min-h-10 max-w-[calc(100vw-3rem)]"><span className="block truncate">{option.label}</span></SelectItem>)}
    </SelectContent>
  </Select>;
}

export function AudioDevicesPopover({ state, controller, speaking }: { state: CallSnapshot; controller: CallController; speaking: boolean }) {
  const [open, setOpen] = useState(false);
  const active = speaking && !state.muted;
  const pending = state.changingDevice !== null;
  return <div className={cn("flex h-11 shrink-0 items-center rounded-full bg-secondary p-0.5 sm:h-12 sm:p-1", state.muted && "bg-destructive/10")} role="group" aria-label="Microphone controls">
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) void controller.refreshDevices(); }}>
      <PopoverTrigger asChild><Button variant="ghost" size="icon" className="h-10 w-8 rounded-full" aria-label="Audio devices" title="Change microphone and speaker"><ChevronDown className={cn("size-4", open && "rotate-180")} /></Button></PopoverTrigger>
      <PopoverContent side="top" align="start" sideOffset={12} className="max-h-(--radix-popover-content-available-height) w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl bg-card p-5" aria-label="Audio device settings">
        <h2 className="mb-5 text-sm font-semibold">Audio devices</h2>
        <div className="space-y-2">
          <Label htmlFor="call-audio-input" className="gap-2"><Mic className="size-4" />Microphone{state.changingDevice === "input" && <LoaderCircle className="size-3 animate-spin motion-reduce:animate-none" />}</Label>
          <DeviceSelect id="call-audio-input" value={state.inputId} options={state.inputs} disabled={pending} onChange={(id) => { void controller.changeInput(id); }} />
          <div className="flex min-h-10 items-center gap-3 rounded-lg bg-secondary px-3 py-2" data-testid="input-activity">
            {state.muted ? <MicOff className="size-5 shrink-0 text-muted-foreground" /> : <AudioActivity active={active} />}
            <span className="text-xs text-muted-foreground">{state.muted ? "Your microphone is muted" : active ? "Sound detected" : "Listening for your voice"}</span>
          </div>
        </div>
        <div className="my-4 h-px bg-border" />
        <div className="space-y-2">
          <Label htmlFor="call-audio-output" className="gap-2"><Volume2 className="size-4" />Speaker{state.changingDevice === "output" && <LoaderCircle className="size-3 animate-spin motion-reduce:animate-none" />}</Label>
          <DeviceSelect id="call-audio-output" value={state.outputId} options={state.canSelectOutput ? state.outputs : [{ id: "", label: "System default" }]} disabled={pending || !state.canSelectOutput} onChange={(id) => { void controller.changeOutput(id); }} />
          {!state.canSelectOutput && <p className="text-xs leading-relaxed text-muted-foreground">This browser uses your system output. Change speakers or headphones in your device’s sound settings.</p>}
          <div className="pt-3"><p className="mb-3 text-xs text-muted-foreground">Listening volume · {Math.round(state.volume * 100)}%</p><Slider aria-label="Listening volume" min={0} max={1} step={0.05} value={[state.volume]} onValueChange={(values) => controller.setVolume(values[0] ?? 0)} /></div>
        </div>
        {state.deviceError && <p role="alert" className="mt-4 text-xs leading-relaxed text-destructive">{state.deviceError}</p>}
      </PopoverContent>
    </Popover>
    <Button size="icon" variant={state.muted ? "destructive" : "secondary"} className="size-10 rounded-full" aria-label={state.muted ? "Unmute microphone" : "Mute microphone"} aria-pressed={state.muted} title={state.muted ? "Unmute microphone" : "Mute microphone"} onClick={() => { void controller.toggleMute(); }}>{state.muted ? <MicOff className="size-5" /> : <Mic className="size-5" />}</Button>
  </div>;
}
