"use client";
import {
  ArrowRight,
  AudioLines,
  Check,
  Globe2,
  Headphones,
  KeyRound,
  Languages,
  Link2,
  LoaderCircle,
  LockKeyhole,
  Mic,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useState, type FormEvent } from "react";
import Link from "next/link";
import { z } from "zod";
import { api } from "@/lib/client-api";
import {
  codeSchema,
  guestSchema,
  roomSchema,
  type Profile,
} from "@/lib/contracts";
import { AudioEngine } from "@/lib/audio/engine";
import type { ActiveCall } from "@/lib/call-controller";
import { readProfile, rememberProfile } from "@/lib/preferences";
import { CallView } from "./call-view";
import { ProfileDialog } from "./profile-dialog";
import { ThemeButton } from "./theme-button";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

interface Props {
  access: boolean;
  configured: boolean;
  inviteCode?: string;
  roomNotice?: string;
}
export function RoomApp({
  access: initialAccess,
  configured,
  inviteCode = "",
  roomNotice = "",
}: Props) {
  const [access, setAccess] = useState(initialAccess);
  const [accessOpen, setAccessOpen] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [accessError, setAccessError] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [code, setCode] = useState(inviteCode);
  const [error, setError] = useState(roomNotice);
  const [mode, setMode] = useState<"create" | "join" | null>(
    inviteCode && initialAccess && !roomNotice ? "join" : null,
  );
  const [pendingMode, setPendingMode] = useState<"create" | "join">("create");
  const [profile, setProfile] = useState<Profile>(readProfile);
  const [call, setCall] = useState<ActiveCall | null>(null);
  const onEnd = useCallback((message: string) => {
    setCall(null);
    setError(message);
    window.history.replaceState(null, "", "/");
  }, []);
  function begin(action: "create" | "join"): void {
    if (!configured) {
      setError(
        "This demo isn’t connected yet. The owner needs to finish setup before calls can start.",
      );
      return;
    }
    if (action === "join") {
      const parsed = codeSchema.safeParse(code);
      if (!parsed.success) {
        setError("Enter an 8-character room code to join.");
        return;
      }
      setCode(parsed.data);
    }
    setError("");
    setProfile(readProfile());
    if (!access) {
      setPendingMode(action);
      setAccessOpen(true);
    } else setMode(action);
  }
  async function unlock(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setUnlocking(true);
    setAccessError("");
    try {
      await api("/api/access", z.object({ ok: z.literal(true) }), {
        code: accessCode,
      });
      setAccess(true);
      setAccessCode("");
      setAccessOpen(false);
      setMode(pendingMode);
    } catch (error: unknown) {
      setAccessError(
        error instanceof Error
          ? error.message
          : "Could not verify the access code.",
      );
    } finally {
      setUnlocking(false);
    }
  }
  async function join(profile: Profile): Promise<void> {
    let engine: AudioEngine | null = null;
    let stream: MediaStream | null = null;
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "Microphone access requires HTTPS or localhost in a supported browser.",
        );
      engine = new AudioEngine();
      await engine.activate();
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      const guest = await api("/api/guest", guestSchema, {});
      const tabId = crypto.randomUUID();
      const room = await api(
        mode === "create"
          ? "/api/rooms"
          : `/api/rooms/${codeSchema.parse(code)}/join`,
        roomSchema,
        { ...profile, tabId },
      );
      rememberProfile(profile);
      setProfile(profile);
      setMode(null);
      window.history.replaceState(null, "", `/room/${room.code}`);
      setCall({ room, guest, tabId, stream, engine });
    } catch (error: unknown) {
      for (const track of stream?.getTracks() ?? []) track.stop();
      engine?.close();
      if (
        error instanceof DOMException &&
        ["NotAllowedError", "PermissionDeniedError"].includes(error.name)
      )
        throw new Error(
          "Microphone permission was denied. Allow microphone access in your browser and retry.",
        );
      if (error instanceof DOMException && error.name === "NotFoundError")
        throw new Error(
          "No microphone was found. Connect a microphone and retry.",
        );
      throw error;
    }
  }
  if (call) return <CallView call={call} onEnd={onEnd} />;
  return (
    <div className="min-h-dvh bg-background">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 sm:px-10 sm:py-8">
        <Link
          href="/"
          className="flex items-center gap-2.5"
          aria-label="Common home"
        >
          <AudioLines className="size-7 text-primary" />
          <span className="text-2xl font-semibold tracking-tight">
            common<span className="text-primary">.</span>
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
            <LockKeyhole className="size-3.5" />
            Private demo
          </span>
          <ThemeButton />
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 pb-12 sm:px-10">
        <div className="grid items-center gap-12 py-10 sm:py-16 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:py-20">
          <section>
            <h1 className="max-w-xl text-5xl leading-[1.06] font-medium tracking-[-0.055em] sm:text-6xl lg:text-7xl">
              Different languages.
              <br />
              <span className="text-primary">One conversation.</span>
            </h1>
            <p className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg">
              Talk naturally. Listen in your language. A quiet space for two
              people to understand each other, in real time.
            </p>
            <div className="mt-9 max-w-md">
              <Button
                className="h-13 rounded-xl px-6 text-base"
                onClick={() => begin("create")}
              >
                <Plus className="size-5" />
                Create a room
                <ArrowRight className="ml-2 size-4" />
              </Button>
              <div className="my-6 flex items-center gap-4">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">
                  or join someone
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  begin("join");
                }}
                className="flex gap-2"
              >
                <div className="relative min-w-0 flex-1">
                  <KeyRound className="pointer-events-none absolute top-4 left-4 size-4 text-muted-foreground" />
                  <Input
                    aria-label="Room code"
                    placeholder="Enter room code"
                    value={code}
                    onChange={(event) =>
                      setCode(
                        event.target.value
                          .toUpperCase()
                          .replace(/[^A-Z0-9]/g, "")
                          .slice(0, 8),
                      )
                    }
                    maxLength={8}
                    className="h-12 rounded-xl bg-card pl-11 font-mono text-base tracking-wider"
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </div>
                <Button
                  variant="outline"
                  type="submit"
                  className="h-12 rounded-xl bg-card px-5"
                >
                  Join
                  <ArrowRight className="size-4" />
                </Button>
              </form>
              {error && (
                <p
                  role="status"
                  className="mt-4 text-sm leading-relaxed text-muted-foreground"
                >
                  {error}
                </p>
              )}
              {!configured && (
                <p className="mt-4 rounded-lg border bg-card p-3 text-xs leading-relaxed text-muted-foreground">
                  The demo is awaiting its service configuration. Calls will be
                  available once setup is complete.
                </p>
              )}
              <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Check className="size-3.5 text-primary" />
                  No accounts
                </span>
                <span className="flex items-center gap-1.5">
                  <Check className="size-3.5 text-primary" />
                  Audio + live captions
                </span>
                <span className="flex items-center gap-1.5">
                  <Check className="size-3.5 text-primary" />
                  Two people
                </span>
              </div>
            </div>
          </section>
          <ConversationPreview />
        </div>
        <section
          className="grid gap-7 border-t pt-8 sm:grid-cols-3 sm:gap-10 sm:pt-10"
          aria-label="How it works"
        >
          {[
            {
              Icon: Link2,
              title: "A room, a simple code.",
              text: "Create a room and share the code with someone you want to talk to.",
            },
            {
              Icon: Headphones,
              title: "Choose what feels familiar.",
              text: "Pick your listening language. Speak naturally, even if you switch languages.",
            },
            {
              Icon: ShieldCheck,
              title: "Here for the conversation.",
              text: "No sign-up. No recordings. Just your voices, translated as you speak.",
            },
          ].map(({ Icon, title, text }) => (
            <div key={title} className="flex gap-3 sm:block">
              <Icon className="mt-0.5 size-5 shrink-0 text-primary sm:mb-4" />
              <div>
                <h2 className="text-sm font-medium">{title}</h2>
                <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
                  {text}
                </p>
              </div>
            </div>
          ))}
        </section>
        <footer className="mt-12 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Globe2 className="size-3.5" />
            Made for understanding.
          </span>
          <span>Live translation by Gemini · Up to 30 minutes</span>
        </footer>
      </main>
      <Dialog open={accessOpen} onOpenChange={setAccessOpen}>
        <DialogContent className="bg-card sm:max-w-sm">
          <DialogHeader>
            <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-secondary text-primary">
              <LockKeyhole className="size-5" />
            </div>
            <DialogTitle className="text-2xl tracking-tight">
              You’re invited.
            </DialogTitle>
            <DialogDescription>
              Enter the shared demo access code to create or join a room.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              void unlock(event);
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="demo-code">Demo access code</Label>
              <Input
                id="demo-code"
                type="password"
                autoComplete="off"
                value={accessCode}
                onChange={(event) => setAccessCode(event.target.value)}
                className="h-12 text-base"
                required
                maxLength={200}
              />
            </div>
            {accessError && (
              <p role="alert" className="text-sm text-destructive">
                {accessError}
              </p>
            )}
            <Button disabled={unlocking || !accessCode} className="h-11 w-full">
              {unlocking ? (
                <LoaderCircle className="animate-spin motion-reduce:animate-none" />
              ) : (
                <>
                  Continue
                  <ArrowRight />
                </>
              )}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      {mode && (
        <ProfileDialog
          key={mode}
          open
          onOpenChange={(open) => {
            if (!open) setMode(null);
          }}
          initial={profile}
          mode={mode}
          onSubmit={join}
        />
      )}
    </div>
  );
}

function ConversationPreview() {
  return (
    <aside
      className="relative mx-auto w-full max-w-lg"
      aria-label="Illustration of a translated conversation"
    >
      <div className="overflow-hidden rounded-2xl border bg-card shadow-[0_12px_48px_-28px_#213c28]">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <span className="flex items-center gap-2 text-xs font-medium">
            <Languages className="size-4 text-primary" />A glimpse of your
            conversation
          </span>
          <span className="rounded-full bg-secondary px-2 py-1 text-[10px] text-muted-foreground">
            Preview
          </span>
        </div>
        <div className="space-y-7 px-6 py-8 sm:px-8">
          <div className="opacity-70">
            <p className="mb-2 text-[11px] font-medium text-muted-foreground">
              MAYA · TRANSLATED FROM SPANISH
            </p>
            <p className="text-xl leading-relaxed tracking-tight">
              It’s so nice to finally talk to you.
            </p>
          </div>
          <div>
            <p className="mb-2 text-[11px] font-medium text-muted-foreground">
              YOU · ENGLISH
            </p>
            <p className="text-xl leading-relaxed tracking-tight">
              I feel like we’re in the same room.
            </p>
          </div>
          <div>
            <p className="mb-2 flex items-center gap-2 text-[11px] font-medium text-primary">
              <span className="size-1.5 rounded-full bg-primary" />
              MAYA · TRANSLATED FROM SPANISH
            </p>
            <p className="text-2xl leading-relaxed tracking-tight">
              That’s the lovely part, isn’t it?
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Esa es la parte bonita, ¿verdad?
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 border-t bg-background p-4">
          <div className="flex items-center gap-3 rounded-xl border-2 border-transparent bg-secondary px-3 py-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-card text-sm text-primary">
              Y
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">You</p>
              <p className="mt-1 text-[10px] text-muted-foreground">English</p>
            </div>
            <Mic className="ml-auto size-3 text-muted-foreground" />
          </div>
          <div className="flex items-center gap-3 rounded-xl border-2 border-primary bg-secondary px-3 py-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm text-primary-foreground">
              M
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">Maya</p>
              <p className="mt-1 text-[10px] text-muted-foreground">Spanish</p>
            </div>
            <AudioLines className="ml-auto size-4 text-primary" />
          </div>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <Headphones className="size-3.5" />
        Their words. Your language. A real connection.
      </div>
    </aside>
  );
}
