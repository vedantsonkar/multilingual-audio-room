import { existsSync } from "node:fs";
import { GoogleGenAI, Modality, type Session } from "@google/genai";

for (const file of [".env.local", ".env"]) if (existsSync(file)) process.loadEnvFile(file);
const key = process.env.GEMINI_API_KEY;
if (!key) throw new Error("Set GEMINI_API_KEY locally before running this check.");
const config = { responseModalities: [Modality.AUDIO], inputAudioTranscription: {}, outputAudioTranscription: {}, translationConfig: { targetLanguageCode: "en", echoTargetLanguage: true } };
let session: Session | undefined;
try {
  const server = new GoogleGenAI({ apiKey: key, httpOptions: { apiVersion: "v1beta", timeout: 15_000 } });
  const auth = await server.authTokens.create({ config: { uses: 1, expireTime: new Date(Date.now() + 60_000).toISOString(), liveConnectConstraints: { model: "gemini-3.5-live-translate-preview", config } } });
  if (!auth.name) throw new Error("No ephemeral token was issued.");
  console.log("Ephemeral translation token: issued (token hidden).");
  const client = new GoogleGenAI({ apiKey: auth.name, httpOptions: { apiVersion: "v1beta" } });
  let ready: (() => void) | undefined;
  let failed: ((error: Error) => void) | undefined;
  const setup = new Promise<void>((resolve, reject) => { ready = resolve; failed = reject; });
  const timer = setTimeout(() => failed?.(new Error("Live setup timed out.")), 20_000);
  try {
    session = await client.live.connect({ model: "gemini-3.5-live-translate-preview", config, callbacks: {
      onmessage: (message) => { if (message.setupComplete) ready?.(); },
      onerror: () => failed?.(new Error("Live setup failed.")),
      onclose: () => failed?.(new Error("Live connection closed before setup.")),
    } });
    await setup;
  } finally { clearTimeout(timer); }
  console.log("Gemini Live translation WebSocket: setup confirmed. No speech was sent.");
} catch (error: unknown) {
  // Provider exceptions can contain request details. Do not print keys or token URLs.
  console.error("Gemini check failed.", error instanceof Error ? error.name : "UnknownError");
  process.exitCode = 1;
} finally { session?.close(); }
