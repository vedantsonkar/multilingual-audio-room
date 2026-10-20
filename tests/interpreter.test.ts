import { afterEach, describe, expect, it, vi } from "vitest";
import { Interpreter } from "../src/lib/audio/interpreter";

vi.mock("@google/genai", () => ({
  Modality: { AUDIO: "AUDIO" },
  GoogleGenAI: class {
    live = { connect: () => Promise.resolve({ sendRealtimeInput: vi.fn(), close: vi.fn() }) };
  },
}));
vi.mock("../src/lib/client-api", () => ({ api: () => Promise.resolve({ token: "auth_tokens/test", language: "en", expiresAt: new Date(Date.now() + 600_000).toISOString() }) }));
afterEach(() => { vi.useRealTimers(); });
describe("interpreter generation cleanup", () => {
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
