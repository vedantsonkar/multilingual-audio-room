import { expect, test } from "@playwright/test";
import { MockServices } from "./services";

test("responsive onboarding, language search and theme", async ({ page }, testInfo) => {
  await new MockServices().attach(page, "00000000-0000-4000-8000-000000000001");
  await page.goto("/"); await expect(page.getByRole("heading", { name: "Different languages. One conversation." })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: /Change theme/ }).click();
  await page.getByRole("button", { name: "Create a room", exact: true }).click();
  await page.getByLabel("Demo access code").fill("test-demo-code"); await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("combobox", { name: "I usually speak" }).click();
  await page.getByPlaceholder("Search languages…").fill("Tamil"); await page.getByRole("option", { name: "Tamil", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "I usually speak" })).toHaveText("Tamil");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("onboarding.png"), fullPage: true });
});
