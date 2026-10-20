import { expect, test, type Page } from "@playwright/test";
import { z } from "zod";

const accessCode = process.env.DEMO_ACCESS_CODE;
test.skip(!accessCode, "Configure the live demo access code before running this opt-in test.");

async function unlock(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Create a room", exact: true }).click();
  await page.getByLabel("Demo access code").fill(accessCode ?? "");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByLabel("Your name", { exact: true })).toBeVisible();
}
async function chooseHindi(page: Page): Promise<void> {
  await page.getByRole("combobox", { name: "I want to listen in" }).click();
  await page.getByPlaceholder("Search languages…").fill("Hindi");
  await page.getByRole("option", { name: /Hindi/ }).click();
}

test("deployed guests connect through private signaling and real Gemini sessions", async ({ browser }, testInfo) => {
  const first = await browser.newContext(); const second = await browser.newContext();
  const a = await first.newPage(); const b = await second.newPage();
  const errors: string[] = [];
  const metrics = { audioChunks: 0, nonSilentChunks: 0, inputTranscripts: 0, outputTranscripts: 0, translatedAudioChunks: 0 };
  const outbound = z.object({ realtimeInput: z.object({ audio: z.object({ data: z.string() }) }) });
  const inbound = z.object({ serverContent: z.object({ inputTranscription: z.unknown().optional(), outputTranscription: z.unknown().optional(), modelTurn: z.object({ parts: z.array(z.object({ inlineData: z.unknown().optional() })) }).optional() }) });
  for (const page of [a, b]) page.on("websocket", (socket) => {
    if (!socket.url().startsWith("wss://generativelanguage.googleapis.com/")) return;
    socket.on("framesent", ({ payload }) => {
      let json: unknown; try { json = JSON.parse(String(payload)); } catch { return; }
      const parsed = outbound.safeParse(json); if (!parsed.success) return;
      const bytes = Buffer.from(parsed.data.realtimeInput.audio.data, "base64");
      metrics.audioChunks++;
      let peak = 0; for (let i = 0; i + 1 < bytes.length; i += 2) peak = Math.max(peak, Math.abs(bytes.readInt16LE(i)));
      if (peak > 100) metrics.nonSilentChunks++;
    });
    socket.on("framereceived", ({ payload }) => {
      let json: unknown; try { json = JSON.parse(String(payload)); } catch { return; }
      const parsed = inbound.safeParse(json); if (!parsed.success) return;
      const content = parsed.data.serverContent;
      if (content.inputTranscription) metrics.inputTranscripts++;
      if (content.outputTranscription) metrics.outputTranscripts++;
      metrics.translatedAudioChunks += content.modelTurn?.parts.filter((part) => part.inlineData).length ?? 0;
    });
  });
  for (const page of [a, b]) page.on("pageerror", (error) => errors.push(error.message));
  try {
    await unlock(a);
    await a.getByLabel("Your name", { exact: true }).fill("Live check Asha");
    await chooseHindi(a);
    await a.getByRole("button", { name: "Create & join room", exact: true }).click();
    const roomCode = await a.getByRole("textbox", { name: "Room code", exact: true }).inputValue();
    expect(roomCode).toMatch(/^[A-Z0-9]{8}$/);
    await a.getByRole("button", { name: "Back to conversation" }).click();

    await unlock(b);
    await b.getByRole("button", { name: "Close", exact: true }).click();
    await b.getByRole("textbox", { name: "Room code", exact: true }).fill(roomCode);
    await b.getByRole("button", { name: "Join", exact: true }).click();
    await b.getByLabel("Your name", { exact: true }).fill("Live check Maya");
    await b.getByRole("button", { name: "Join room", exact: true }).click();
    await b.getByRole("button", { name: "Back to conversation" }).click();

    for (const page of [a, b]) {
      await expect(page.getByText("Connected", { exact: true })).toBeVisible({ timeout: 35_000 });
      await expect(page.getByText("Live translation", { exact: true })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole("button", { name: "Invite a guest", exact: true })).toHaveCount(0);
    }
    if (process.env.LIVE_AUDIO_FIXTURE) {
      for (const page of [a, b]) {
        await expect(page.getByTestId("transcript-entry").first()).toBeVisible({ timeout: 35_000 });
        await expect.poll(async () => page.getByTestId("transcript-entry").evaluateAll((nodes) => new Set(nodes.map((node) => node.getAttribute("data-speaker"))).size), { timeout: 30_000 }).toBe(2);
      }
      await expect(a.getByTestId("transcript-entry").filter({ hasText: /[\u0900-\u097F]/ }).first()).toBeVisible({ timeout: 30_000 });
      await expect.poll(async () => a.getByTestId("transcript-entry").count(), { timeout: 35_000 }).toBeGreaterThanOrEqual(4);
      const lines = await a.getByTestId("transcript-entry").evaluateAll((nodes) => nodes.map((node) => ({ speaker: node.getAttribute("data-speaker"), opacity: getComputedStyle(node).opacity })));
      for (const speaker of new Set(lines.map((line) => line.speaker))) {
        const spoken = lines.filter((line) => line.speaker === speaker);
        expect(spoken.at(-1)?.opacity).toBe("1");
        if (spoken.length > 1) expect(spoken[0]?.opacity).toBe("0.7");
      }
      expect(metrics.nonSilentChunks).toBeGreaterThan(0);
      expect(metrics.translatedAudioChunks).toBeGreaterThan(0);
    }
    await a.getByRole("button", { name: "Mute microphone", exact: true }).click();
    await expect(a.getByRole("button", { name: "Unmute microphone", exact: true })).toBeVisible();
    await a.screenshot({ path: testInfo.outputPath("live-hindi-conversation.png"), fullPage: true });
    await b.screenshot({ path: testInfo.outputPath("live-english-conversation.png"), fullPage: true });
    expect(errors).toEqual([]);
  } finally {
    await testInfo.attach("provider-counts", { body: JSON.stringify(metrics), contentType: "application/json" });
    console.log("Live provider counts:", metrics);
    for (const page of [a, b]) {
      const leave = page.getByRole("button", { name: "Leave call", exact: true });
      if (await leave.isVisible()) await leave.click();
    }
    await first.close(); await second.close();
  }
});
