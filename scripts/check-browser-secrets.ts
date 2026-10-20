import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { loadLocalEnv } from "./load-local-env";
loadLocalEnv();
const secretNames = ["GEMINI_API_KEY", "SUPABASE_SECRET_KEY", "STORAGE_SUPABASE_SECRET_KEY", "STORAGE_SUPABASE_SERVICE_ROLE_KEY", "DEMO_ACCESS_CODE", "ACCESS_COOKIE_SECRET"];
const root = join(process.env.NEXT_BUILD_DIR || ".next", "static");
async function files(path: string): Promise<string[]> {
  const entries = await readdir(path, { withFileTypes: true }); const output: string[] = [];
  for (const entry of entries) {
    const file = join(path, entry.name);
    if (entry.isDirectory()) output.push(...await files(file)); else if (entry.name.endsWith(".js")) output.push(file);
  }
  return output;
}
let leaked = false;
const bundles = await files(root);
for (const file of bundles) {
  const text = await readFile(file, "utf8");
  for (const name of secretNames) {
    const value = process.env[name];
    if (value && text.includes(value)) { leaked = true; console.error(`Server secret found in browser bundle: ${name} (value hidden).`); }
  }
}
if (leaked) process.exitCode = 1;
else console.log(`Checked ${bundles.length} browser bundles: no configured server secret values found.`);
