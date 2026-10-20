export class PcmResampler {
  private pending = new Float32Array(0);
  private cursor = 0;
  constructor(private readonly sourceRate: number, private readonly targetRate = 16000) {}
  push(input: Float32Array): Int16Array {
    const combined = new Float32Array(this.pending.length + input.length);
    combined.set(this.pending); combined.set(input, this.pending.length);
    const step = this.sourceRate / this.targetRate;
    const output: number[] = [];
    while (this.cursor + step <= combined.length) {
      // Area-average the source interval to low-pass before downsampling.
      const end = this.cursor + step; let sum = 0;
      for (let index = Math.floor(this.cursor); index < Math.ceil(end); index++) {
        const weight = Math.min(index + 1, end) - Math.max(index, this.cursor);
        sum += (combined[index] ?? 0) * weight;
      }
      const sample = Math.max(-1, Math.min(1, sum / step));
      output.push(Math.round(sample * (sample < 0 ? 32768 : 32767)));
      this.cursor = end;
    }
    const consumed = Math.floor(this.cursor);
    this.pending = combined.slice(consumed); this.cursor -= consumed;
    return Int16Array.from(output);
  }
}
export function pcmToBase64(samples: Int16Array): string {
  const bytes = new Uint8Array(samples.length * 2); const view = new DataView(bytes.buffer);
  for (let i = 0; i < samples.length; i++) view.setInt16(i * 2, samples[i] ?? 0, true);
  let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
export function base64ToFloat32(encoded: string): Float32Array<ArrayBuffer> {
  const binary = atob(encoded); const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const view = new DataView(bytes.buffer); const output = new Float32Array(Math.floor(bytes.length / 2));
  for (let i = 0; i < output.length; i++) output[i] = view.getInt16(i * 2, true) / 32768;
  return output;
}
