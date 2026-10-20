import { appendFile, readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { loadLocalEnv } from "./load-local-env";

loadLocalEnv();
if (existsSync(".env.vercel.local")) {
  const pulled = await readFile(".env.vercel.local", "utf8");
  const current = existsSync(".env.local") ? await readFile(".env.local", "utf8") : "";
  const existingKeys = new Set(current.split(/\r?\n/).map((line) => line.split("=")[0]));
  await appendFile(".env.local", "\n" + pulled.split(/\r?\n/).filter((line) => /^[A-Z_]+=/.test(line) && !existingKeys.has(line.split("=")[0])).join("\n") + "\n");
}
const secrets = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  DEMO_ACCESS_CODE: process.env.DEMO_ACCESS_CODE || randomBytes(12).toString("base64url"),
  ACCESS_COOKIE_SECRET: process.env.ACCESS_COOKIE_SECRET || randomBytes(32).toString("base64url"),
};
const globalModules = process.platform === "win32"
  ? spawnSync(process.execPath, [resolve(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js"), "root", "--global"], { encoding: "utf8" })
  : spawnSync("npm", ["root", "--global"], { encoding: "utf8" });
if (globalModules.status !== 0) throw new Error("Could not locate the installed Vercel CLI.");
const cli = resolve(globalModules.stdout.trim(), "vercel/dist/index.js");
const existingLocal = await readFile(".env.local", "utf8");
for (const [name, value] of Object.entries(secrets)) {
  if (!value) throw new Error(`${name} is missing.`);
  if (!new RegExp(`^${name}=`, "m").test(existingLocal)) await appendFile(".env.local", `${name}=${JSON.stringify(value)}\n`);
  const result = spawnSync(process.execPath, [cli, "env", "add", name, "--environment", "production,preview,development", "--sensitive", "--yes"], { input: value, encoding: "utf8" });
  if (result.status !== 0) {
    if (result.stderr.includes("already exists")) console.log(`${name}: already configured; left unchanged.`);
    else { console.error(`${name}: environment synchronization failed (secret hidden).`); process.exitCode = 1; }
  } else console.log(`${name}: configured for production, preview and development (secret hidden).`);
}
