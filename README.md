# Common

A guest-only, two-person audio room. Each person speaks naturally and listens in their own language, with a named live transcript. Built with Next.js App Router, strict TypeScript, Tailwind v4, shadcn/ui, Supabase, WebRTC, and Gemini Live Translate.

## Run locally

Requires Node.js 22.12+ (Node 24 recommended).

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Populate the environment variables below. Without them, the landing page remains available and explains that calls are awaiting configuration. Microphone access requires HTTPS or localhost.

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Server-only Google AI Studio key with access to `gemini-3.5-live-translate-preview` |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Browser-safe Supabase publishable key |
| `SUPABASE_SECRET_KEY` | Server-only Supabase secret key or legacy service-role key |
| `DEMO_ACCESS_CODE` | Shared demo gate, at least six characters |
| `ACCESS_COOKIE_SECRET` | Random signing secret, at least 32 characters |

Vercel's Supabase integration names work directly: `STORAGE_SUPABASE_URL`, `STORAGE_SUPABASE_PUBLISHABLE_KEY`, and `STORAGE_SUPABASE_SECRET_KEY`. The legacy `STORAGE_SUPABASE_ANON_KEY` and `STORAGE_SUPABASE_SERVICE_ROLE_KEY` are also supported. Empty canonical values do not shadow populated integration variables. Never prefix Gemini, service-role, or signing secrets with `NEXT_PUBLIC_`.

## Supabase setup

Use a dedicated project for the demo. Apply `supabase/migrations/20261020141801_create_audio_rooms.sql` through the Supabase SQL Editor or the Supabase CLI after linking your project. The migration creates rooms, memberships, shared request limits, RLS policies, and two service-role-only transactional functions. Review existing tables before applying; the migration deliberately fails on name collisions rather than overwriting data.

In the Supabase Dashboard:

1. Enable **Authentication → Sign In / Providers → Anonymous Sign-Ins**. No email/password or OAuth provider is needed.
2. Under **Realtime settings**, turn off **Allow public access**. The app uses private broadcast channels with membership-based authorization.
3. Keep RLS enabled on all application tables. Do not grant browser clients insert/update/delete access. Do not disable RLS to resolve an error.

Admission, heartbeat, settings, Wait, leave, and token checks run through Next.js routes. The anonymous session supplies a verified identity; the service-role-only RPC serializes each room mutation with a row lock. The browser uses its short-lived Supabase access token only for private signaling.

Anonymous Auth and direct Gemini sessions are designed for a small access-code demo, not an unrestricted public launch. Before opening public registration, add provider-level bot protection and stronger usage budgets. Supabase does not automatically clean up old anonymous users; schedule maintenance when the demo becomes long-lived. Do not delete active users or rooms.

## Vercel

Link the existing project, then pull its integration configuration:

```sh
vercel link --yes --project multilingual-audio-room --scope YOUR_TEAM
vercel env pull .env.local --yes
```

Add `GEMINI_API_KEY`, `DEMO_ACCESS_CODE`, and `ACCESS_COOKIE_SECRET` to Development, Preview, and Production. Treat them as secrets. Supabase variables provisioned by the Vercel integration do not need renaming. Redeploy after changing environment variables; existing deployments keep their old environment snapshot.

`scripts/configure-vercel.ts` can synchronize the three app secrets using stdin, without putting their values in command arguments or logs. It preserves existing Vercel variables, writes generated gate/signing secrets only to ignored `.env.local`, and requires an authenticated global Vercel CLI. Read a generated demo code locally; do not commit it.

The app hosts no WebSocket server on Vercel. Browsers connect to Supabase Realtime and Gemini directly; Gemini uses one-use, language-constrained tokens minted server-side. The documented translation endpoint is `v1beta`; SDK 2.30.0 may log an outdated `v1alpha` warning, but a real `v1beta` token/setup check has succeeded.

## Call behavior

- Maximum two participants. Room codes contain eight uppercase letters/digits. Duplicate tabs under one guest session cannot claim two seats.
- Heartbeats run every five seconds. A seat expires after 15 seconds without renewal. A continuously empty room closes after 30 seconds, enforced by database timestamps when any room operation runs.
- A lone participant gets a warning after one minute and leaves after two minutes. **Wait** restarts that two-minute interval. This applies both before the first guest joins and after a peer leaves.
- The 30-minute call deadline starts when the second person first joins. Rejoining never resets it. A warning appears with two minutes remaining.
- Normal audio always goes through Gemini, including same-language speech, so users can switch spoken languages naturally. On translation failure, audio pauses until recovery or the listener explicitly chooses original audio.
- The transcript shows peer translations and self originals, with source text expandable. Each speaker's newest entry has full opacity; their previous entries use 70%. Scrolling back pauses autoscroll until **Jump to live** is selected.
- Transcript history is memory-only and bounded to the latest 1,000 entries. It is lost on refresh/leave and is never stored in Supabase or localStorage. Name/language preferences alone are remembered locally.

**STUN only:** Cloudflare STUN is free. There is no TURN service, fallback relay, or TURN credential configuration. Some restrictive networks cannot establish a direct call. Gemini and hosting have independent pricing and quotas. Audio is processed by Google for translation; do not describe these calls as end-to-end private from the translation provider.

## Checks

```sh
npm run typecheck
npm run lint
npm test
npx playwright install chromium webkit
npm run test:e2e
npm run build
npm run db:types
npm run check:gemini
npm run check:supabase
npm run check:browser-secrets
```

`db:types` applies the migrations to an isolated PostgreSQL-compatible PGlite instance and regenerates `src/lib/database.types.ts`; it never touches your live database. The database tests also run without Supabase credentials and exercise RLS, privileged RPC access, admission, leases, solo waiting, expiry, and request limits.

Browser tests use real browser microphone fixtures, AudioWorklets, RTCPeerConnection, data channels, and playback. Only the Supabase/Gemini providers are simulated. They use port 3002 and `.next-e2e`, leaving a running development server intact. These tests do not establish live provider translation accuracy or physical iPhone/Android compatibility.

`check:gemini` uses the locally configured key to issue an ephemeral token and confirm Live Translate WebSocket setup, without sending speech or printing credentials. A complete live call also requires the Supabase migration and settings above. Test iPhone Safari and Android Chrome on real devices with the page visible before relying on mobile calls; background/locked-phone continuity is outside this release.

`check:supabase` verifies Auth reachability, anonymous sign-in configuration, and room table/RPC availability through the SDK. `check:browser-secrets` scans production browser chunks for the locally configured server secret values; build first, and set `NEXT_BUILD_DIR` if the build uses another output directory.

`npm run test:live` is a separate, opt-in check against the deployed app and real providers. It creates two isolated guest sessions, connects a direct WebRTC call through private signaling, opens constrained Gemini sessions, checks mute, and leaves both seats. It uses local `DEMO_ACCESS_CODE` without logging it; traces are disabled because they can contain temporary credentials. Set `LIVE_BASE_URL` to check another deployment. Set `LIVE_AUDIO_FIXTURE` to an absolute path to a synthetic, 16-bit mono PCM WAV speech clip to additionally verify named transcripts in both directions and Hindi output. This sends the fixture to Gemini and consumes live API quota. Generated speech, screenshots, and other local artifacts belong in ignored `artifacts/`.

Remote streams are attached to an inaudible playing audio element before Web Audio capture, addressing Chromium issue 40094084. Original audio still reaches the listener only after they explicitly select **Listen to original**. Browser regression tests assert non-silent PCM reaches the interpreter so connection-only success cannot hide an empty audio stream.

Strict TypeScript and type-aware ESLint apply to application code, copied components, worklet sources, scripts, and tests. External JSON is validated before use. The worklet JavaScript in `public/audio` is generated from typed source by `predev`/`prebuild`.
