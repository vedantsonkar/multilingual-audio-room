import { GoogleGenAI, Modality, type LiveServerMessage, type Session } from "@google/genai";
import { api } from "../client-api";
import { tokenSchema } from "../contracts";
import { pcmToBase64 } from "./pcm";
import type { AudioEngine } from "./engine";

export type TranslationStatus = "starting" | "live" | "retrying" | "error" | "original";
export interface CaptionUpdate { id: string; original: string; translated: string; final: boolean; }
interface Options {
  code: string; tabId: string; stream: MediaStream; engine: Pick<AudioEngine, "capture" | "clear" | "play">;
  onStatus: (status: TranslationStatus, message: string) => void;
  onCaption: (caption: CaptionUpdate) => void;
}

export class Interpreter {
  private disposed = false;
  private version = 0;
  private retries = 0;
  private session: Session | null = null;
  private stopCapture: (() => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private setupTimer: ReturnType<typeof setTimeout> | null = null;
  private ready = false;
  private caption: CaptionUpdate = this.newCaption();
  constructor(private readonly options: Options) {}
  private newCaption(): CaptionUpdate { return { id: crypto.randomUUID(), original: "", translated: "", final: false }; }
  private emit(final = false): void {
    if (!this.caption.original && !this.caption.translated) return;
    this.options.onCaption({ ...this.caption, final });
    if (final) this.caption = this.newCaption();
  }
  async start(): Promise<void> {
    if (this.disposed) return;
    const version = ++this.version; this.disconnect(); this.emit(true);
    this.options.onStatus(this.retries ? "retrying" : "starting", this.retries ? "Reconnecting translation…" : "Starting your interpreter…");
    try {
      const auth = await api(`/api/rooms/${this.options.code}/token`, tokenSchema, { tabId: this.options.tabId });
      if (this.disposed || version !== this.version) return;
      const ai = new GoogleGenAI({ apiKey: auth.token, httpOptions: { apiVersion: "v1beta" } });
      const session = await ai.live.connect({
        model: "gemini-3.5-live-translate-preview",
        config: { responseModalities: [Modality.AUDIO], inputAudioTranscription: {}, outputAudioTranscription: {}, translationConfig: { targetLanguageCode: auth.language, echoTargetLanguage: true } },
        callbacks: {
          onmessage: (message: LiveServerMessage) => {
            if (this.disposed || version !== this.version) return;
            try { this.receive(message); } catch (error: unknown) { this.failed(version, error instanceof Error ? error.message : "Translation failed."); }
          },
          onerror: () => this.failed(version, "Translation connection interrupted."),
          onclose: () => this.failed(version, "Translation connection closed."),
        },
      });
      if (this.disposed || version !== this.version) { session.close(); return; }
      this.session = session;
      const stopCapture = await this.options.engine.capture(this.options.stream, (samples) => {
        if (!this.ready || this.disposed || version !== this.version) return;
        try { session.sendRealtimeInput({ audio: { data: pcmToBase64(samples), mimeType: "audio/pcm;rate=16000" } }); }
        catch { this.failed(version, "Could not stream audio to translation."); }
      });
      if (this.disposed || version !== this.version) { stopCapture(); return; }
      this.stopCapture = stopCapture;
      if (!this.ready) this.setupTimer = setTimeout(() => this.failed(version, "Translation took too long to start."), 15_000);
      const rotateIn = Math.max(1000, Math.min(9 * 60_000, Date.parse(auth.expiresAt) - Date.now() - 10_000));
      this.timer = setTimeout(() => { this.retries = 0; void this.start(); }, rotateIn);
    } catch (error: unknown) {
      this.failed(version, error instanceof Error ? error.message : "Translation could not start.");
    }
  }
  private receive(message: LiveServerMessage): void {
    if (message.setupComplete) {
      this.ready = true; this.retries = 0;
      if (this.setupTimer) clearTimeout(this.setupTimer);
      this.options.onStatus("live", "Live translation");
    }
    const content = message.serverContent;
    if (content?.interrupted) this.options.engine.clear();
    if (content?.inputTranscription?.text) this.caption.original += content.inputTranscription.text;
    if (content?.outputTranscription?.text) this.caption.translated += content.outputTranscription.text;
    if (content?.inputTranscription || content?.outputTranscription) this.emit();
    for (const part of content?.modelTurn?.parts ?? []) {
      if (part.inlineData?.data) this.options.engine.play(part.inlineData.data);
    }
    if (content?.turnComplete || this.caption.original.length > 4000 || this.caption.translated.length > 4000) this.emit(true);
    if (message.goAway) { this.retries = 0; void this.start(); }
  }
  private failed(version: number, message: string): void {
    if (this.disposed || version !== this.version) return;
    ++this.version; this.disconnect(); this.emit(true);
    if (this.retries < 3) {
      const delay = 1000 * 2 ** this.retries++;
      this.options.onStatus("retrying", message + " Retrying…");
      this.timer = setTimeout(() => { void this.start(); }, delay);
    } else this.options.onStatus("error", message);
  }
  private disconnect(): void {
    this.ready = false;
    if (this.timer) clearTimeout(this.timer);
    if (this.setupTimer) clearTimeout(this.setupTimer);
    this.timer = null; this.setupTimer = null;
    this.stopCapture?.(); this.stopCapture = null;
    const session = this.session; this.session = null;
    if (session) { try { session.sendRealtimeInput({ audioStreamEnd: true }); } catch { /* Connection already closed. */ } session.close(); }
    this.options.engine.clear();
  }
  close(): void { this.disposed = true; ++this.version; this.disconnect(); this.emit(true); }
}
