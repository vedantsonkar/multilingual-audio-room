import { describe, expect, it } from "vitest";
import { PcmResampler, base64ToFloat32, pcmToBase64 } from "../src/lib/audio/pcm";
import { latestEntriesBySpeaker, signalSchema, profileSchema, type TranscriptEntry } from "../src/lib/contracts";
import { LANGUAGES } from "../src/lib/languages";
describe("audio processing", () => {
  it("resamples continuous 48k audio into 16k PCM without losing block boundaries", () => {
    const converter = new PcmResampler(48000); let output = 0;
    for (let i = 0; i < 375; i++) { const samples = converter.push(new Float32Array(128).fill(0.5)); output += samples.length; expect(samples.every((value) => value === 16384)).toBe(true); }
    expect(output).toBe(16000);
  });
  it("preserves count at 44.1k and encodes little-endian clipped samples", () => {
    const converter = new PcmResampler(44100); const samples = converter.push(new Float32Array(44100).fill(-2));
    expect(samples.length).toBeGreaterThanOrEqual(15999); expect(samples.length).toBeLessThanOrEqual(16000);
    expect(samples.every((sample) => sample === -32768)).toBe(true);
    const decoded = base64ToFloat32(pcmToBase64(new Int16Array([-32768, 0, 16384, 32767])));
    expect([...decoded]).toEqual([-1, 0, 0.5, 32767 / 32768]);
  });
  it("rejects invalid sample rates and incomplete PCM frames", () => {
    for (const rate of [0, -1, Infinity, NaN]) expect(() => new PcmResampler(rate)).toThrow();
    expect(() => base64ToFloat32(btoa("x"))).toThrow(/incomplete/);
  });
});
describe("contracts and transcript emphasis", () => {
  it("keeps the latest entry per speaker independently", () => {
    const entries: TranscriptEntry[] = [
      { id: "a1", speakerId: "a", original: "hello", translated: "", createdAt: 1 },
      { id: "b1", speakerId: "b", original: "hola", translated: "hello", createdAt: 2 },
      { id: "a2", speakerId: "a", original: "again", translated: "", createdAt: 3 },
    ];
    expect([...latestEntriesBySpeaker(entries)]).toEqual([["a", "a2"], ["b", "b1"]]);
  });
  it("rejects unsupported language and malformed signaling", () => {
    expect(new Set(LANGUAGES.map(([code]) => code)).size).toBe(LANGUAGES.length);
    expect(profileSchema.safeParse({ name: " ", speakingLanguage: "en", listeningLanguage: "en" }).success).toBe(false);
    expect(profileSchema.safeParse({ name: "Guest", speakingLanguage: "xx", listeningLanguage: "en" }).success).toBe(false);
    expect(signalSchema.safeParse({ type: "ice", from: "untrusted", candidate: "bad" }).success).toBe(false);
  });
});
