import { defineConfig, devices } from "@playwright/test";
import { loadLocalEnv } from "./scripts/load-local-env";

loadLocalEnv();
const fixture = process.env.LIVE_AUDIO_FIXTURE;
export default defineConfig({
  testDir: "tests/live",
  workers: 1,
  timeout: 120_000,
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env.LIVE_BASE_URL || "https://multilingual-audio-room.vercel.app",
    channel: "chromium",
    // Live traces could contain temporary provider credentials. Keep them off.
    trace: "off",
    screenshot: "off",
    launchOptions: { args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
      ...(fixture ? [`--use-file-for-fake-audio-capture=${fixture}`] : []),
    ] },
  },
});
