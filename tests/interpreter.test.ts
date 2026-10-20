import { afterEach, describe, expect, it, vi } from "vitest";
import { Interpreter, type CaptionUpdate } from "../src/lib/audio/interpreter";
import type { LiveServerMessage } from "@google/genai";

const provider = vi.hoisted(() => ({ receive: (message: LiveServerMessage): void => { void message; } }));
function receive(content: NonNullable<LiveServerMessage["serverContent"]>): void {
  provider.receive({ serverContent: content, text: undefined, data: undefined });
}

vi.mock("@google/genai", () => ({
  Modality: { AUDIO: "AUDIO" },
  GoogleGenAI: class {
    live = { connect: (options: { callbacks: { onmessage: (message: LiveServerMessage) => void } }) => {
      provider.receive = options.callbacks.onmessage;
      return Promise.resolve({ sendRealtimeInput: vi.fn(), close: vi.fn() });
    } };
  },
}));
vi.mock("../src/lib/client-api", () => ({ api: () => Promise.resolve({ token: "auth_tokens/test", language: "en", expiresAt: new Date(Date.now() + 600_000).toISOString() }) }));
afterEach(() => { vi.useRealTimers(); });
describe("interpreter generation cleanup", () => {
  it("groups continuous translation into paired lines without turnComplete", async () => {
    vi.useFakeTimers();
    const onCaption = vi.fn<(caption: CaptionUpdate) => void>();
    const interpreter = new Interpreter({ code: "TEST1234", tabId: "test", stream: Object.create(null) as MediaStream, engine: { capture: () => Promise.resolve(vi.fn()), clear: vi.fn(), play: vi.fn() }, onStatus: vi.fn(), onCaption });
    await interpreter.start(); provider.receive({ setupComplete: {}, text: undefined, data: undefined });
    receive({ inputTranscription: { text: "Hello Maya." } });
    receive({ outputTranscription: { text: "नमस्ते माया।" } });
    expect(onCaption.mock.calls[0]?.[0]).toMatchObject({ original: "Hello Maya.", final: false });
    expect(onCaption).toHaveBeenLastCalledWith(expect.objectContaining({ original: "Hello Maya.", translated: "नमस्ते माया।", final: true }));
    const finalizedId = onCaption.mock.lastCall?.[0].id;
    receive({ inputTranscription: { text: "Nice to meet" } });
    receive({ outputTranscription: { text: "आपसे मिलकर" } });
    await vi.advanceTimersByTimeAsync(1800);
    expect(onCaption).toHaveBeenLastCalledWith(expect.objectContaining({ original: "Nice to meet", translated: "आपसे मिलकर", final: true }));
    expect(onCaption.mock.lastCall?.[0].id).not.toBe(finalizedId);
    interpreter.close();
  });
  it("closes a late capture from an old session without stopping the replacement", async () => {
    vi.useFakeTimers();
    let release: ((stop: () => void) => void) | undefined;
    const oldStop = vi.fn(); const newStop = vi.fn();
    const capture = vi.fn<() => Promise<() => void>>()
      .mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }))
      .mockResolvedValueOnce(newStop);
    // Only stream identity is passed to the capture adapter in this unit test.
    const stream = Object.create(null) as MediaStream;
    const interpreter = new Interpreter({ code: "TEST1234", tabId: "test", stream, engine: { capture, clear: vi.fn(), play: vi.fn() }, onStatus: vi.fn(), onCaption: vi.fn() });
    const pending = interpreter.start();
    await vi.waitFor(() => expect(capture).toHaveBeenCalledTimes(1));
    await interpreter.start();
    release?.(oldStop); await pending;
    expect(oldStop).toHaveBeenCalledTimes(1); expect(newStop).not.toHaveBeenCalled();
    interpreter.close(); expect(newStop).toHaveBeenCalledTimes(1);
  });
});
