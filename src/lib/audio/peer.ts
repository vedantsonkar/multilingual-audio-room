import { createClient, REALTIME_SUBSCRIBE_STATES, type RealtimeChannel } from "@supabase/supabase-js";
import { captionSchema, signalSchema, type Guest, type Signal } from "../contracts";
import type { Database } from "../database.types";

interface PeerOptions {
  code: string; epoch: string; guest: Guest; peerId: string; stream: MediaStream;
  onStream: (stream: MediaStream) => void;
  onConnection: (status: string) => void;
  onCaption: (caption: { id: string; text: string; final: boolean }) => void;
}
export class CallPeer {
  private readonly pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }] });
  private readonly client;
  private channel: RealtimeChannel | null = null;
  private data: RTCDataChannel | null = null;
  private remoteElement: HTMLAudioElement | null = null;
  private closed = false;
  private connected = false;
  private offering = false;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private readyTimer: ReturnType<typeof setInterval> | null = null;
  private chain: Promise<void> = Promise.resolve();
  constructor(private readonly options: PeerOptions) {
    this.client = createClient<Database>(options.guest.supabaseUrl, options.guest.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, accessToken: () => Promise.resolve(options.guest.accessToken),
    });
    for (const track of options.stream.getAudioTracks()) this.pc.addTrack(track, options.stream);
    this.pc.ontrack = (event) => {
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      this.releaseRemoteElement();
      // Chromium can deliver silent Web Audio samples until the remote stream
      // is attached to a playing media element (Chromium issue 40094084).
      // Keep that element inaudible; only the interpreter or explicit original
      // listening path may reach the listener's speakers.
      const element = document.createElement("audio");
      element.muted = true; element.autoplay = true;
      element.setAttribute("playsinline", ""); element.srcObject = stream;
      this.remoteElement = element;
      void element.play().catch(() => { if (!this.closed && this.remoteElement === element) this.error("Remote audio could not start. Please reconnect the call."); });
      this.options.onStream(stream);
    };
    this.pc.onicecandidate = (event) => { if (event.candidate) { const ice = event.candidate; void this.send({ type: "ice", from: options.guest.id, epoch: options.epoch, candidate: { candidate: ice.candidate, sdpMid: ice.sdpMid, sdpMLineIndex: ice.sdpMLineIndex, usernameFragment: ice.usernameFragment } }).catch(() => this.error("Signaling connection interrupted.")); } };
    this.pc.onconnectionstatechange = () => {
      if (this.closed) return;
      if (this.pc.connectionState === "connected") {
        this.connected = true; if (this.timeout) clearTimeout(this.timeout);
        if (this.readyTimer) clearInterval(this.readyTimer);
        this.options.onConnection("Connected");
      } else if (this.pc.connectionState === "failed") this.error("A direct call connection could not be established. Try another network and reconnect.");
      else if (this.pc.connectionState === "disconnected") this.options.onConnection("Connection interrupted — reconnect if this continues.");
    };
    this.pc.ondatachannel = (event) => this.bindData(event.channel);
    if (this.isOfferer) this.bindData(this.pc.createDataChannel("captions", { ordered: true }));
  }
  private get isOfferer(): boolean { return this.options.guest.id < this.options.peerId; }
  private bindData(channel: RTCDataChannel): void {
    this.data = channel;
    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (typeof event.data !== "string" || event.data.length > 20_000) return;
      let value: unknown; try { value = JSON.parse(event.data); } catch { return; }
      const parsed = captionSchema.safeParse(value); if (parsed.success) this.options.onCaption(parsed.data);
    };
  }
  sendCaption(id: string, text: string, final: boolean): void {
    if (this.data?.readyState === "open" && this.data.bufferedAmount < 64_000) this.data.send(JSON.stringify({ type: "caption", id, text: text.slice(0, 12_000), final }));
  }
  async replaceMicrophone(track: MediaStreamTrack): Promise<void> {
    if (this.closed) return;
    const sender = this.pc.getSenders().find((sender) => sender.track?.kind === "audio");
    if (!sender) throw new Error("The outgoing microphone track is unavailable.");
    await sender.replaceTrack(track);
  }
  async start(): Promise<void> {
    this.options.onConnection("Connecting call…");
    await this.client.realtime.setAuth(this.options.guest.accessToken);
    if (this.closed) return;
    this.channel = this.client.channel(`call:${this.options.code}:${this.options.epoch}`, { config: { private: true, broadcast: { ack: true, self: false } } });
    this.channel.on("broadcast", { event: "signal" }, ({ payload }: { payload: unknown }) => {
      const parsed = signalSchema.safeParse(payload);
      if (!parsed.success || parsed.data.from !== this.options.peerId || parsed.data.epoch !== this.options.epoch) return;
      this.chain = this.chain.then(() => this.receive(parsed.data)).catch(() => this.error("Call negotiation failed. Please reconnect."));
    }).subscribe((status) => {
      if (this.closed) return;
      if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
        void this.ready();
        this.readyTimer = setInterval(() => { if (!this.connected) void this.ready(); }, 2000);
      } else if (status === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR || status === REALTIME_SUBSCRIBE_STATES.TIMED_OUT) this.error("Room signaling is unavailable. Please reconnect.");
    });
    this.timeout = setTimeout(() => { if (!this.connected) this.error("No direct connection after 25 seconds. This network may block peer-to-peer calls. Try another network."); }, 25_000);
  }
  private async ready(): Promise<void> {
    try { await this.send({ type: "ready", from: this.options.guest.id, epoch: this.options.epoch }); }
    catch { this.error("Room signaling is unavailable. Please reconnect."); }
  }
  private async send(signal: Signal): Promise<void> {
    if (this.closed || !this.channel) return;
    const status = await this.channel.send({ type: "broadcast", event: "signal", payload: signal });
    if (status !== "ok" && !this.closed) throw new Error("Signal delivery failed");
  }
  private async receive(signal: Signal): Promise<void> {
    if (this.closed) return;
    if (signal.type === "ready") {
      if (!this.isOfferer || this.offering || this.pc.signalingState !== "stable" || this.connected) return;
      this.offering = true;
      const offer = await this.pc.createOffer(); await this.pc.setLocalDescription(offer);
      await this.send({ type: "description", from: this.options.guest.id, epoch: this.options.epoch, description: { type: "offer", sdp: offer.sdp ?? "" } });
    } else if (signal.type === "description") {
      if (signal.description.type === "offer" && this.isOfferer) return;
      if (signal.description.type === "answer" && this.pc.signalingState !== "have-local-offer") return;
      await this.pc.setRemoteDescription(signal.description);
      for (const candidate of this.pendingCandidates) await this.pc.addIceCandidate(candidate);
      this.pendingCandidates = [];
      if (signal.description.type === "offer") {
        const answer = await this.pc.createAnswer(); await this.pc.setLocalDescription(answer);
        await this.send({ type: "description", from: this.options.guest.id, epoch: this.options.epoch, description: { type: "answer", sdp: answer.sdp ?? "" } });
      }
    } else {
      const candidate: RTCIceCandidateInit = { candidate: signal.candidate.candidate, sdpMid: signal.candidate.sdpMid ?? null, sdpMLineIndex: signal.candidate.sdpMLineIndex ?? null, usernameFragment: signal.candidate.usernameFragment ?? null };
      if (this.pc.remoteDescription) await this.pc.addIceCandidate(candidate);
      else if (this.pendingCandidates.length < 100) this.pendingCandidates.push(candidate);
    }
  }
  private error(message: string): void { if (!this.closed) this.options.onConnection(message); }
  private releaseRemoteElement(): void {
    if (!this.remoteElement) return;
    this.remoteElement.pause(); this.remoteElement.srcObject = null; this.remoteElement = null;
  }
  close(): void {
    this.closed = true; if (this.timeout) clearTimeout(this.timeout); if (this.readyTimer) clearInterval(this.readyTimer);
    this.releaseRemoteElement(); this.data?.close(); this.pc.close();
    if (this.channel) void this.client.removeChannel(this.channel);
    void this.client.realtime.disconnect();
  }
}
