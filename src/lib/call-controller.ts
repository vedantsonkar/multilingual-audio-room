import { api, ApiError } from "./client-api";
import { roomSchema, type Guest, type Profile, type Room, type TranscriptEntry } from "./contracts";
import type { AudioEngine } from "./audio/engine";
import { CallPeer } from "./audio/peer";
import { Interpreter, type TranslationStatus } from "./audio/interpreter";

export interface ActiveCall { room: Room; guest: Guest; tabId: string; stream: MediaStream; engine: AudioEngine; }
export interface CallSnapshot {
  room: Room; knownMembers: Room["members"]; entries: TranscriptEntry[]; connection: string;
  translation: TranslationStatus; translationMessage: string;
  speaking: Record<string, boolean>; muted: boolean; volume: number;
  now: number; error: string; audioSuspended: boolean;
}
export class CallController {
  private snapshot: CallSnapshot;
  private readonly listeners = new Set<() => void>();
  private started = false;
  private closed = false;
  private teardown: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private clock: ReturnType<typeof setInterval> | null = null;
  private syncPending = false;
  private failures = 0;
  private offset: number;
  private peer: CallPeer | null = null;
  private peerKey = "";
  private interpreter: Interpreter | null = null;
  private remote: MediaStream | null = null;
  private remoteMonitor: (() => void) | null = null;
  private originalStop: (() => void) | null = null;
  constructor(readonly call: ActiveCall, private readonly onEnd: (message: string) => void) {
    this.offset = Date.parse(call.room.serverNow) - Date.now();
    this.snapshot = { room: call.room, knownMembers: call.room.members, entries: [], connection: "Waiting for your guest", translation: "starting", translationMessage: "Translation starts when someone joins.", speaking: {}, muted: false, volume: 0.85, now: Date.now() + this.offset, error: "", audioSuspended: call.engine.suspended };
    call.engine.setVolume(0.85);
  }
  getSnapshot = (): CallSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  private update(patch: Partial<CallSnapshot>): void {
    if (this.closed) return;
    this.snapshot = { ...this.snapshot, ...patch }; for (const listener of this.listeners) listener();
  }
  attach(): () => void {
    if (this.teardown) clearTimeout(this.teardown);
    if (!this.started) this.start();
    return () => { this.teardown = setTimeout(() => this.dispose(), 0); };
  }
  private start(): void {
    this.started = true;
    this.call.engine.monitor(this.call.stream, (speaking) => this.speaking(this.call.guest.id, speaking));
    for (const track of this.call.stream.getAudioTracks()) track.addEventListener("ended", this.microphoneEnded);
    this.applyRoom(this.call.room);
    this.heartbeat = setInterval(() => { void this.sync(); }, 5000);
    this.clock = setInterval(() => {
      const now = Date.now() + this.offset;
      this.update({ now, audioSuspended: this.call.engine.suspended });
      const end = this.snapshot.room.endsAt;
      const alone = this.snapshot.room.aloneSince;
      if (end && now >= Date.parse(end)) void this.leave("Your 30-minute call has ended.");
      else if (alone && now >= Date.parse(alone) + 120_000) void this.leave("You left the room after waiting alone for two minutes.");
    }, 1000);
    window.addEventListener("pagehide", this.pageHide);
    window.addEventListener("online", this.onOnline);
    document.addEventListener("visibilitychange", this.visibility);
  }
  private pageHide = (): void => {
    void fetch(`/api/rooms/${this.call.room.code}/leave`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tabId: this.call.tabId }), keepalive: true }).catch(() => undefined);
    this.dispose();
  };
  private onOnline = (): void => { void this.sync(); };
  private microphoneEnded = (): void => {
    this.stopInterpreter();
    this.update({ muted: true, error: "Your microphone disconnected. Leave and rejoin after reconnecting it." });
  };
  private visibility = (): void => { if (document.visibilityState === "visible") void this.sync(); };
  private async sync(): Promise<void> {
    if (this.closed || this.syncPending) return; this.syncPending = true;
    try { const room = await this.action("heartbeat"); this.failures = 0; this.applyRoom(room); }
    catch (error: unknown) {
      if (error instanceof ApiError && [401, 403, 404, 410].includes(error.status)) { this.dispose(); this.onEnd(error.message); }
      else if (++this.failures >= 2) { this.closePeer(); this.update({ connection: "Connection interrupted. Trying to reconnect…", error: "Unable to refresh your room. Check your connection." }); }
    } finally { this.syncPending = false; }
  }
  private action(action: string, extra: Record<string, unknown> = {}): Promise<Room> {
    return api(`/api/rooms/${this.call.room.code}/${action}`, roomSchema, { tabId: this.call.tabId, ...extra });
  }
  private applyRoom(room: Room): void {
    if (this.closed || Date.parse(room.serverNow) < Date.parse(this.snapshot.room.serverNow)) return;
    const oldSelf = this.snapshot.room.members.find((member) => member.id === this.call.guest.id);
    const self = room.members.find((member) => member.id === this.call.guest.id);
    if (!self) { this.dispose(); this.onEnd("Your seat is no longer active. Join again to continue."); return; }
    this.offset = Date.parse(room.serverNow) - Date.now();
    const known = new Map(this.snapshot.knownMembers.map((member) => [member.id, member]));
    for (const member of room.members) known.set(member.id, member);
    this.update({ room, knownMembers: [...known.values()], error: "", now: Date.now() + this.offset });
    const peer = room.members.find((member) => member.id !== this.call.guest.id);
    const key = peer ? `${room.epoch}:${peer.id}` : "";
    if (key !== this.peerKey) {
      this.closePeer(); this.peerKey = key;
      if (peer) {
        const instance = new CallPeer({ code: room.code, epoch: room.epoch, guest: this.call.guest, peerId: peer.id, stream: this.call.stream,
          onStream: (stream) => {
            if (this.closed || this.peer !== instance) return;
            this.remoteMonitor?.(); this.remote = stream;
            this.remoteMonitor = this.call.engine.monitor(stream, (speaking) => this.speaking(peer.id, speaking));
            this.startInterpreter();
          },
          onConnection: (connection) => {
            this.update({ connection });
            if (connection !== "Connected" && !connection.startsWith("Connecting")) this.stopInterpreter();
          },
          onCaption: (caption) => this.upsertEntry(`self:${caption.id}`, this.call.guest.id, caption.text, ""),
        });
        this.peer = instance;
        void instance.start().catch(() => this.update({ connection: "Could not connect the call. Please reconnect." }));
      } else this.update({ connection: "Waiting for your guest", translation: "starting", translationMessage: "Translation starts when someone joins." });
    } else if (oldSelf?.listeningLanguage !== self.listeningLanguage && this.remote) this.startInterpreter();
  }
  private speaking(id: string, speaking: boolean): void {
    this.update({ speaking: { ...this.snapshot.speaking, [id]: speaking } });
  }
  private upsertEntry(id: string, speakerId: string, original: string, translated: string): void {
    if (!original && !translated) return;
    const current = this.snapshot.entries;
    const existing = current.findIndex((entry) => entry.id === id);
    const entries = [...current];
    if (existing < 0) entries.push({ id, speakerId, original, translated, createdAt: Date.now() });
    else { const entry = entries[existing]; if (entry) entries[existing] = { ...entry, original, translated }; }
    this.update({ entries: entries.slice(-1000) });
  }
  private startInterpreter(): void {
    this.stopInterpreter(); const stream = this.remote;
    const peerId = this.snapshot.room.members.find((member) => member.id !== this.call.guest.id)?.id;
    if (!stream || !peerId || this.closed) return;
    const instance = new Interpreter({ code: this.call.room.code, tabId: this.call.tabId, stream, engine: this.call.engine,
      onStatus: (translation, translationMessage) => { if (this.interpreter === instance) this.update({ translation, translationMessage }); },
      onCaption: (caption) => {
        if (this.closed) return;
        this.upsertEntry(caption.id, peerId, caption.original, caption.translated);
        this.peer?.sendCaption(caption.id, caption.original, caption.final);
      },
    });
    this.interpreter = instance; void instance.start();
  }
  private stopInterpreter(): void { this.interpreter?.close(); this.interpreter = null; this.originalStop?.(); this.originalStop = null; this.call.engine.clear(); }
  private closePeer(): void {
    this.stopInterpreter(); this.peer?.close(); this.peer = null; this.peerKey = "";
    this.remoteMonitor?.(); this.remoteMonitor = null; this.remote = null;
  }
  async retry(): Promise<void> { try { await this.call.engine.activate(); this.startInterpreter(); } catch { this.update({ error: "Audio playback could not start. Check browser permissions." }); } }
  async listenOriginal(): Promise<void> {
    if (!this.remote) return;
    try { await this.call.engine.activate(); this.stopInterpreter(); this.originalStop = this.call.engine.original(this.remote); this.update({ translation: "original", translationMessage: "Listening to original audio. Translation is off." }); }
    catch { this.update({ error: "Original audio could not start." }); }
  }
  async resumeAudio(): Promise<void> { try { await this.call.engine.activate(); this.update({ audioSuspended: this.call.engine.suspended }); } catch { this.update({ error: "Please enable audio playback in your browser." }); } }
  async reconnect(): Promise<void> { this.closePeer(); await this.sync(); }
  async toggleMute(): Promise<void> {
    const muted = !this.snapshot.muted;
    for (const track of this.call.stream.getAudioTracks()) track.enabled = !muted;
    this.update({ muted });
    try { await this.saveProfile(this.selfProfile(), muted); }
    catch { this.update({ error: "Your microphone changed locally; the room status will update when the connection recovers." }); }
  }
  private selfProfile(): Profile {
    const member = this.snapshot.room.members.find((member) => member.id === this.call.guest.id);
    if (!member) throw new Error("Participant is missing");
    return { name: member.name, speakingLanguage: member.speakingLanguage, listeningLanguage: member.listeningLanguage };
  }
  async saveProfile(profile: Profile, muted = this.snapshot.muted): Promise<void> { this.applyRoom(await this.action("settings", { ...profile, muted })); }
  setVolume(volume: number): void { this.call.engine.setVolume(volume); this.update({ volume }); }
  async wait(): Promise<void> {
    try { this.applyRoom(await this.action("wait")); } catch (error: unknown) { this.update({ error: error instanceof Error ? error.message : "Could not extend waiting time." }); }
  }
  async leave(message = "You left the call."): Promise<void> {
    if (this.closed) return;
    this.dispose(); this.onEnd(message);
    try { await this.action("leave"); } catch { /* Lease expiry releases the seat if the request cannot reach the server. */ }
  }
  dispose(): void {
    if (this.closed) return;
    this.closePeer(); this.closed = true;
    if (this.heartbeat) clearInterval(this.heartbeat); if (this.clock) clearInterval(this.clock);
    window.removeEventListener("pagehide", this.pageHide); window.removeEventListener("online", this.onOnline); document.removeEventListener("visibilitychange", this.visibility);
    for (const track of this.call.stream.getTracks()) { track.removeEventListener("ended", this.microphoneEnded); track.stop(); } this.call.engine.close();
  }
}
