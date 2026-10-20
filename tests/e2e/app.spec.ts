import { expect, test } from "@playwright/test";
import { MockServices, enterCall } from "./services";

const first = "00000000-0000-4000-8000-000000000001";
const second = "00000000-0000-4000-8000-000000000002";
test("guest gate, preferences, invite, layout and leave", async ({ page }, testInfo) => {
  const services = new MockServices(); await services.attach(page, first);
  await page.goto("/"); await page.getByRole("button", { name: "Create a room", exact: true }).click();
  await page.getByLabel("Demo access code").fill("wrong"); await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("isn’t correct");
  await page.getByLabel("Demo access code").fill("test-demo-code"); await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Create & join room", exact: true }).click(); await expect(page.getByText("Enter your name", { exact: true })).toBeVisible();
  await page.getByLabel("Your name", { exact: true }).fill("Asha");
  await page.getByRole("combobox", { name: "I want to listen in" }).click(); await page.getByPlaceholder("Search languages…").fill("Hindi"); await page.getByRole("option", { name: /Hindi/ }).click();
  await page.getByRole("button", { name: "Create & join room", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Room code", exact: true })).toHaveValue("TEST1234");
  await page.getByRole("button", { name: "Back to conversation" }).click();
  await expect(page.getByRole("region", { name: "Asha, you" })).toBeVisible();
  const dimensions = await page.evaluate(() => {
    const transcript = document.querySelector('[aria-label="Live transcript"]')?.getBoundingClientRect();
    const participants = document.querySelector('[aria-label="Participants"]')?.getBoundingClientRect();
    return { transcript, participants, overflow: document.documentElement.scrollWidth > window.innerWidth };
  });
  expect(dimensions.overflow).toBe(false);
  if (testInfo.project.name === "mobile") expect(dimensions.participants?.top).toBeGreaterThan(dimensions.transcript?.top ?? 0);
  else expect(dimensions.participants?.left).toBeGreaterThan(dimensions.transcript?.left ?? 0);
  await page.getByRole("button", { name: "Mute microphone", exact: true }).click(); await expect(page.getByRole("button", { name: "Unmute microphone", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Call preferences" }).click(); await page.getByLabel("Your name", { exact: true }).fill("Asha Patel"); await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText("Asha Patel", { exact: false }).first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("call.png"), fullPage: true });
  await page.getByRole("button", { name: "Leave call", exact: true }).click(); await expect(page.getByText("You left the call.", { exact: true })).toBeVisible();
  const saved = await page.evaluate(() => localStorage.getItem("audio-room-preferences-v1")); expect(saved).toContain("Asha Patel"); expect(saved).toContain('"listeningLanguage":"hi"');
});

test("two real browser peers exchange audio, named captions and independent text emphasis", async ({ page, context }, testInfo) => {
  const services = new MockServices(); await services.attach(page, first);
  const peer = await context.newPage(); await services.attach(peer, second);
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message)); peer.on("pageerror", (error) => errors.push(error.message));
  await enterCall(page, "Asha"); await enterCall(peer, "Maya", false);
  await expect(page.getByText("Connected", { exact: true })).toBeVisible({ timeout: 25_000 });
  await expect(peer.getByText("Connected", { exact: true })).toBeVisible({ timeout: 25_000 });
  await expect(page.getByTestId("transcript-entry").filter({ hasText: "translated" }).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("transcript-entry").filter({ hasText: "original" }).first()).toBeVisible();
  await expect.poll(async () => page.getByTestId("transcript-entry").count()).toBeGreaterThanOrEqual(6);
  const opacity = await page.getByTestId("transcript-entry").evaluateAll((nodes) => nodes.map((node) => ({ speaker: node.getAttribute("data-speaker"), opacity: getComputedStyle(node).opacity })));
  for (const id of [first, second]) {
    const lines = opacity.filter((line) => line.speaker === id); expect(lines.at(-1)?.opacity).toBe("1"); expect(lines[0]?.opacity).toBe("0.7");
  }
  await page.screenshot({ path: testInfo.outputPath("conversation.png"), fullPage: true });
  expect(services.audioChunks).toBeGreaterThan(0); expect(services.nonSilentAudioChunks).toBeGreaterThan(0); expect(services.tokenRequests).toBe(2); expect(errors).toEqual([]);
  services.failTranslation = true;
  await page.getByRole("button", { name: "Call preferences" }).click();
  await page.getByRole("combobox", { name: "I want to listen in" }).click(); await page.getByPlaceholder("Search languages…").fill("Hindi"); await page.getByRole("option", { name: /Hindi/ }).click(); await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByRole("button", { name: "Listen to original", exact: true })).toBeVisible(); await page.getByRole("button", { name: "Listen to original", exact: true }).click();
  await expect(page.getByText("Listening to original audio. Translation is off.")).toBeVisible();
  await page.getByRole("button", { name: "Leave call", exact: true }).click(); await peer.getByRole("button", { name: "Leave call", exact: true }).click();
});

test("solo warning, Wait reset and provider admission errors", async ({ page }) => {
  const services = new MockServices(); await services.attach(page, first); await enterCall(page, "Asha");
  services.aloneSince = new Date(Date.now() - 61_000).toISOString();
  await expect(page.getByRole("heading", { name: "Are you still waiting?" })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Wait", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Are you still waiting?" })).not.toBeVisible();
  await page.getByRole("button", { name: "Leave call", exact: true }).click();
  services.rejectJoin = true;
  await page.getByRole("textbox", { name: "Room code", exact: true }).fill("TEST1234"); await page.getByRole("button", { name: "Join", exact: true }).click(); await page.getByRole("button", { name: "Join room", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("room is full");
});

test("call controls stay reachable on small phones, landscape and large displays", async ({ page }) => {
  const services = new MockServices(); await services.attach(page, first); await enterCall(page, "A very long guest name with many words");
  for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }, { width: 2048, height: 1152 }]) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole("button", { name: "Leave call", exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.getByRole("button", { name: "Leave call", exact: true }).click();
});
