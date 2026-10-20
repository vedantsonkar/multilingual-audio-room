import { expect, test } from "@playwright/test";
import { enterCall, MockServices } from "./services";
import { audioDeviceFixture } from "../audio-device-fixture";

test.use({ launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required", `--use-file-for-fake-audio-capture=${audioDeviceFixture()}`] } });

declare global {
  interface Window {
    audioDeviceTest: { streams: MediaStream[]; failInput: boolean; failOutput: boolean; outputs: string[]; holdInput: boolean; releaseInput: (() => void) | null };
  }
}

test("switching devices keeps the call, mute and audio activity working", async ({ page, context }, testInfo) => {
  await context.addInitScript(() => {
    window.audioDeviceTest = { streams: [], failInput: false, failOutput: false, outputs: [], holdInput: false, releaseInput: null };
    const capture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", { value: async (constraints: MediaStreamConstraints) => {
      const state = window.audioDeviceTest;
      if (state.failInput) { state.failInput = false; throw new DOMException("Test permission denial", "NotAllowedError"); }
      // Both fake microphones emit the same tone. Disable echo cancellation in
      // this fixture so one fake peer cannot cancel the other's identical tone.
      const audio = constraints.audio;
      const requested: MediaStreamConstraints = { ...constraints };
      if (typeof audio === "object") requested.audio = { ...audio, echoCancellation: false, noiseSuppression: false, autoGainControl: false };
      const stream = await capture(requested); state.streams.push(stream);
      if (state.holdInput) { state.holdInput = false; await new Promise<void>((resolve) => { state.releaseInput = resolve; }); }
      return stream;
    } });
    // Deterministic output adapter; the browser still runs the real Web Audio
    // graph. Physical speaker routing needs a real-device check.
    Object.defineProperty(AudioContext.prototype, "setSinkId", { configurable: true, value: (id: string): Promise<void> => {
      const state = window.audioDeviceTest;
      if (state.failOutput) { state.failOutput = false; return Promise.reject(new DOMException("Test output denial", "NotAllowedError")); }
      state.outputs.push(id); return Promise.resolve();
    } });
  });
  const services = new MockServices(); await services.attach(page, "00000000-0000-4000-8000-000000000001");
  const peer = await context.newPage(); await services.attach(peer, "00000000-0000-4000-8000-000000000002");
  await enterCall(page, "Asha"); await enterCall(peer, "Maya", false);
  await expect(page.getByText("Connected", { exact: true })).toBeVisible({ timeout: 25_000 });
  await expect(page.getByRole("region", { name: /^Maya/ }).getByTestId("audio-activity")).toHaveAttribute("data-active", "true", { timeout: 10_000 });
  await page.getByRole("button", { name: "Audio devices", exact: true }).click();
  await expect(page.getByTestId("input-activity").getByTestId("audio-activity")).toHaveAttribute("data-active", "true", { timeout: 10_000 });
  await page.screenshot({ path: testInfo.outputPath("audio-devices.png"), fullPage: true });
  await page.getByRole("combobox", { name: "Microphone", exact: true }).click();
  const micOptions = page.getByRole("option"); const secondMicrophone = micOptions.filter({ hasText: /Fake Audio Input 2/ });
  await secondMicrophone.click();
  await expect(page.getByRole("combobox", { name: "Microphone", exact: true })).toContainText("Fake Audio Input 2");
  expect(await page.evaluate(() => window.audioDeviceTest.streams[0]?.getAudioTracks()[0]?.readyState)).toBe("ended");
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
  const listener = "00000000-0000-4000-8000-000000000002";
  const audioBefore = services.nonSilentByListener.get(listener) ?? 0;
  await expect.poll(() => services.nonSilentByListener.get(listener) ?? 0).toBeGreaterThan(audioBefore);
  expect(services.tokenRequests).toBe(2);

  await page.getByRole("slider", { name: "Listening volume" }).press("Home");
  await expect(page.getByText("Listening volume · 0%", { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Speaker", exact: true }).click();
  await page.getByRole("option").filter({ hasText: /Fake Audio Output 1/ }).click();
  await expect(page.getByRole("combobox", { name: "Speaker", exact: true })).toContainText("Fake Audio Output 1");
  expect(await page.evaluate(() => window.audioDeviceTest.outputs.length)).toBe(1);
  await page.evaluate(() => { window.audioDeviceTest.failOutput = true; });
  await page.getByRole("combobox", { name: "Speaker", exact: true }).click(); await page.getByRole("option", { name: "System default", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Audio device settings" }).getByRole("alert")).toContainText("speaker");
  await expect(page.getByRole("combobox", { name: "Speaker", exact: true })).toContainText("Fake Audio Output 1");
  await page.evaluate(() => {
    const enumerate = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
    const removed = window.audioDeviceTest.outputs[0];
    Object.defineProperty(navigator.mediaDevices, "enumerateDevices", { value: async () => (await enumerate()).filter((device) => device.deviceId !== removed) });
    navigator.mediaDevices.dispatchEvent(new Event("devicechange"));
  });
  await expect(page.getByRole("combobox", { name: "Speaker", exact: true })).toContainText("System default");
  expect(await page.evaluate(() => window.audioDeviceTest.outputs.at(-1))).toBe("");

  await page.evaluate(() => { window.audioDeviceTest.failInput = true; });
  await page.getByRole("combobox", { name: "Microphone", exact: true }).click(); await page.getByRole("option", { name: "System default", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Audio device settings" }).getByRole("alert")).toContainText("microphone");
  expect(await page.evaluate(() => window.audioDeviceTest.streams.at(-1)?.getAudioTracks()[0]?.readyState)).toBe("live");
  await page.keyboard.press("Escape"); await page.getByRole("button", { name: "Mute microphone", exact: true }).click();
  await page.getByRole("button", { name: "Audio devices", exact: true }).click();
  await page.getByRole("combobox", { name: "Microphone", exact: true }).click(); await page.getByRole("option", { name: "System default", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Microphone", exact: true })).toContainText("System default");
  expect(await page.evaluate(() => window.audioDeviceTest.streams.at(-1)?.getAudioTracks()[0]?.enabled)).toBe(false);
  await expect(page.getByTestId("input-activity")).toContainText("muted");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const peerActivity = page.getByRole("region", { name: /^Maya/ }).getByTestId("audio-activity");
  await expect(peerActivity).toBeVisible();
  expect(await peerActivity.locator("path").first().evaluate((node) => getComputedStyle(node).animationName)).toBe("none");
  await page.evaluate(() => { window.audioDeviceTest.holdInput = true; });
  const streamCount = await page.evaluate(() => window.audioDeviceTest.streams.length);
  await page.getByRole("combobox", { name: "Microphone", exact: true }).click(); await page.getByRole("option").filter({ hasText: /Fake Audio Input 1/ }).click();
  await expect.poll(async () => page.evaluate(() => window.audioDeviceTest.streams.length)).toBeGreaterThan(streamCount);
  await page.keyboard.press("Escape"); await page.getByRole("button", { name: "Leave call", exact: true }).click();
  await page.evaluate(() => { window.audioDeviceTest.releaseInput?.(); });
  await expect.poll(async () => page.evaluate(() => window.audioDeviceTest.streams.every((stream) => stream.getTracks().every((track) => track.readyState === "ended")))).toBe(true);
  await peer.getByRole("button", { name: "Leave call", exact: true }).click();
});

test("output capability guidance and audio menu fit a small screen", async ({ page }, testInfo) => {
  await page.addInitScript(() => { Object.defineProperty(AudioContext.prototype, "setSinkId", { value: undefined, configurable: true }); });
  const services = new MockServices(); await services.attach(page, "00000000-0000-4000-8000-000000000001"); await enterCall(page, "Asha");
  await page.setViewportSize({ width: 320, height: 568 });
  await page.getByRole("button", { name: "Audio devices", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Speaker", exact: true })).toBeDisabled();
  await expect(page.getByText(/This browser uses your system output/)).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Microphone", exact: true })).toBeInViewport();
  await expect(page.getByRole("slider", { name: "Listening volume" })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("audio-devices-small.png"), fullPage: true });
  await page.keyboard.press("Escape"); await page.getByRole("button", { name: "Leave call", exact: true }).click();
});
