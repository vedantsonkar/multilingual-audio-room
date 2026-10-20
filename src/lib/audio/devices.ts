export interface AudioDevice { id: string; label: string; }
interface SelectableAudioContext extends AudioContext { setSinkId(deviceId: string): Promise<void>; }

export function supportsOutputSelection(context: AudioContext): context is SelectableAudioContext {
  return "setSinkId" in context && typeof context.setSinkId === "function";
}
export function deviceOptions(devices: readonly MediaDeviceInfo[], kind: "audioinput" | "audiooutput"): AudioDevice[] {
  const options: AudioDevice[] = [{ id: "", label: "System default" }];
  const seen = new Set(["", "default"]);
  for (const device of devices) {
    if (device.kind !== kind || seen.has(device.deviceId)) continue;
    seen.add(device.deviceId);
    options.push({ id: device.deviceId, label: device.label || `${kind === "audioinput" ? "Microphone" : "Speaker"} ${options.length}` });
  }
  return options;
}
export function deviceError(error: unknown, kind: "input" | "output"): string {
  const device = kind === "input" ? "microphone" : "speaker";
  const name = error instanceof Error || error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return `Permission to use that ${device} was denied. Check this site's audio permissions and try again.`;
  if (name === "NotFoundError" || name === "OverconstrainedError") return `That ${device} is no longer available. Connect it again or choose another device.`;
  if (name === "NotReadableError" || name === "InvalidAccessError") return `That ${device} could not be opened. It may be in use by another app.`;
  return `Could not change the ${device}. Your previous selection is still in use. Try another device.`;
}
