import { describe, expect, it } from "vitest";
import { deviceError, deviceOptions } from "../src/lib/audio/devices";

function device(kind: MediaDeviceKind, deviceId: string, label = ""): MediaDeviceInfo {
  return { kind, deviceId, label, groupId: "test-group", toJSON: () => ({ kind, deviceId, label }) };
}
describe("audio device choices", () => {
  it("keeps a default choice and deduplicates only the requested device kind", () => {
    const devices = [device("audioinput", "default", "Default microphone"), device("audioinput", "mic-a", "USB microphone"), device("audioinput", "mic-a", "Duplicate"), device("audioinput", "mic-b"), device("audiooutput", "speaker-a", "Headphones"), device("videoinput", "camera-a")];
    expect(deviceOptions(devices, "audioinput")).toEqual([{ id: "", label: "System default" }, { id: "mic-a", label: "USB microphone" }, { id: "mic-b", label: "Microphone 2" }]);
    expect(deviceOptions(devices, "audiooutput")).toEqual([{ id: "", label: "System default" }, { id: "speaker-a", label: "Headphones" }]);
    expect(deviceOptions([], "audioinput")).toHaveLength(1);
  });
  it("gives actionable permission, unavailable and busy-device errors", () => {
    expect(deviceError(new DOMException("", "NotAllowedError"), "input")).toMatch(/Permission.*microphone.*denied/);
    expect(deviceError(new DOMException("", "OverconstrainedError"), "input")).toMatch(/no longer available/);
    expect(deviceError(new DOMException("", "InvalidAccessError"), "output")).toMatch(/another app/);
    expect(deviceError({ message: "untrusted" }, "output")).toMatch(/previous selection is still in use/);
  });
});
