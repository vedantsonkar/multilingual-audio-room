import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e", fullyParallel: false, workers: 1, timeout: 45_000,
  use: { baseURL: "http://localhost:3002", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel: "chromium", launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] } } },
    { name: "mobile", use: { ...devices["Pixel 7"], channel: "chromium", launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] } } },
    { name: "iphone-webkit", testMatch: "layout.spec.ts", use: { ...devices["iPhone 13"], browserName: "webkit" } },
  ],
  webServer: {
    command: "npm run dev -- --port 3002", url: "http://localhost:3002", timeout: 120_000, reuseExistingServer: !process.env.CI,
    env: { NEXT_BUILD_DIR: ".next-e2e", DEMO_ACCESS_CODE: "test-demo-code", ACCESS_COOKIE_SECRET: "test-signing-secret-with-at-least-thirty-two-characters", GEMINI_API_KEY: "e2e-server-gemini-secret", SUPABASE_URL: "https://example.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test", SUPABASE_SECRET_KEY: "e2e-server-supabase-secret" },
  },
});
