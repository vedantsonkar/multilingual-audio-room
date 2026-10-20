import { base64ToFloat32 } from "./pcm";
import { supportsOutputSelection } from "./devices";

export class AudioEngine {
  readonly context: AudioContext;
  private readonly volume: GainNode;
  private nextTime = 0;
  private readonly sources = new Set<AudioBufferSourceNode>();
  private readonly cleanups = new Set<() => void>();
  constructor() {
    this.context = new AudioContext({ latencyHint: "interactive" });
    this.volume = this.context.createGain(); this.volume.connect(this.context.destination);
  }
  async activate(): Promise<void> { if (this.context.state === "suspended") await this.context.resume(); }
  get suspended(): boolean { return this.context.state !== "running"; }
  get canSelectOutput(): boolean { return supportsOutputSelection(this.context); }
  async setOutput(deviceId: string): Promise<void> {
    if (!supportsOutputSelection(this.context)) throw new Error("Choose the speaker through your device’s sound settings in this browser.");
    await this.context.setSinkId(deviceId);
  }
  setVolume(volume: number): void { this.volume.gain.value = Math.max(0, Math.min(volume, 1)); }
  play(encoded: string): void {
    if (this.context.state !== "running") return;
    if (this.nextTime - this.context.currentTime > 3) { this.clear(); throw new Error("Audio playback fell behind. Please retry translation."); }
    const data = base64ToFloat32(encoded); if (!data.length) return;
    const buffer = this.context.createBuffer(1, data.length, 24000); buffer.copyToChannel(data, 0);
    const source = this.context.createBufferSource(); source.buffer = buffer; source.connect(this.volume);
    this.nextTime = Math.max(this.nextTime, this.context.currentTime + 0.025);
    source.start(this.nextTime); this.nextTime += buffer.duration; this.sources.add(source);
    source.onended = () => { this.sources.delete(source); source.disconnect(); };
  }
  clear(): void {
    for (const source of this.sources) { source.stop(); source.disconnect(); }
    this.sources.clear(); this.nextTime = 0;
  }
  async capture(stream: MediaStream, onChunk: (data: Int16Array) => void): Promise<() => void> {
    await this.context.audioWorklet.addModule("/audio/capture-worklet.js");
    const source = this.context.createMediaStreamSource(stream);
    const worklet = new AudioWorkletNode(this.context, "pcm-capture");
    worklet.port.onmessage = (event: MessageEvent<unknown>) => { if (event.data instanceof ArrayBuffer) onChunk(new Int16Array(event.data)); };
    source.connect(worklet); worklet.connect(this.context.destination);
    const stop = () => { source.disconnect(); worklet.disconnect(); worklet.port.onmessage = null; worklet.port.close(); this.cleanups.delete(stop); };
    this.cleanups.add(stop); return stop;
  }
  original(stream: MediaStream): () => void {
    this.clear(); const source = this.context.createMediaStreamSource(stream); source.connect(this.volume);
    const stop = () => { source.disconnect(); this.cleanups.delete(stop); }; this.cleanups.add(stop); return stop;
  }
  monitor(stream: MediaStream, onSpeaking: (speaking: boolean) => void): () => void {
    const source = this.context.createMediaStreamSource(stream); const analyser = this.context.createAnalyser();
    analyser.fftSize = 512;
    // Pull the analyser through an inaudible destination path so input-only
    // meters continue updating even before a peer/interpreter is connected.
    const silence = this.context.createGain(); silence.gain.value = 0;
    source.connect(analyser); analyser.connect(silence); silence.connect(this.context.destination);
    const samples = new Float32Array(analyser.fftSize);
    let lastSpeech = 0; let previous = false;
    const timer = window.setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
      if (rms > 0.025) lastSpeech = performance.now();
      const speaking = performance.now() - lastSpeech < 300;
      if (speaking !== previous) { previous = speaking; onSpeaking(speaking); }
    }, 100);
    const stop = () => { window.clearInterval(timer); source.disconnect(); analyser.disconnect(); silence.disconnect(); onSpeaking(false); this.cleanups.delete(stop); };
    this.cleanups.add(stop); return stop;
  }
  close(): void {
    this.clear(); for (const cleanup of [...this.cleanups]) cleanup();
    if (this.context.state !== "closed") void this.context.close();
  }
}
