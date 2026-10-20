import { existsSync } from "node:fs";
export function loadLocalEnv(): void {
  for (const file of [".env.local", ".env.vercel.local", ".env"]) if (existsSync(file)) process.loadEnvFile(file);
}
