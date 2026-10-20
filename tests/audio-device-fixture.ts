import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Loud, deterministic PCM makes activity tests independent of Chromium's
// platform-specific default fake microphone amplitude. No recording is used.
export function audioDeviceFixture(): string {
  const rate = 16000; const samples = rate * 2; const bytes = samples * 2;
  const wav = Buffer.alloc(44 + bytes);
  wav.write("RIFF", 0); wav.writeUInt32LE(36 + bytes, 4); wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write("data", 36); wav.writeUInt32LE(bytes, 40);
  for (let sample = 0; sample < samples; sample++) {
    const value = sample % rate < rate * 0.8 ? Math.sin(2 * Math.PI * 440 * sample / rate) * 10000 : 0;
    wav.writeInt16LE(Math.round(value), 44 + sample * 2);
  }
  const dir = join(process.cwd(), "artifacts"); mkdirSync(dir, { recursive: true });
  const file = join(dir, "audio-device-test.wav"); writeFileSync(file, wav); return file;
}
