import { PcmResampler } from "./pcm";

declare const sampleRate: number;
declare class AudioWorkletProcessor { readonly port: MessagePort; }
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;

class CaptureProcessor extends AudioWorkletProcessor {
  private readonly resampler = new PcmResampler(sampleRate);
  private chunk = new Int16Array(1600);
  private length = 0;
  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0]?.[0];
    if (!input) return true;
    const samples = this.resampler.push(input);
    for (const sample of samples) {
      this.chunk[this.length++] = sample;
      if (this.length === this.chunk.length) {
        this.port.postMessage(this.chunk.buffer, [this.chunk.buffer]);
        this.chunk = new Int16Array(1600); this.length = 0;
      }
    }
    return true;
  }
}
registerProcessor("pcm-capture", CaptureProcessor);
