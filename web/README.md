# Voice Platform — Frontend Console

Next.js 15 (App Router) / React 19 / TypeScript / Tailwind console for the
existing `gateway/` backend. This directory is new; nothing under
`gateway/` was touched.

## Setup

```bash
cd web
cp .env.example .env.local   # fill in the deployed gateway's URLs
npm install
npm run dev                  # http://localhost:3000
```

`npm run build` has been verified to compile and type-check cleanly
against this codebase (Next.js font fetching needs outbound network
access to fonts.googleapis.com at build time — normal in any real dev/CI
environment, just not in the sandbox this was built in).

### Environment variables

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | Base URL of the gateway, e.g. `https://voice-platform-gateway.onrender.com` |
| `NEXT_PUBLIC_WS_URL` | WebSocket origin, `wss://` scheme, same host |

Never hardcoded — see `src/lib/api/client.ts`.

## Pages

| Route | What it does | Backend it calls |
|---|---|---|
| `/` | Landing page | — |
| `/dashboard` | Gateway status, provider health, known-issues writeup | `/health`, `/health/providers` |
| `/chat` | Text → Text, streamed | `POST /v1/voice/complete` (SSE) |
| `/voice` | Speech ⇄ Speech, Speech → Text, and a "type instead" mode that also covers Text → Speech pipeline testing | `WS /v1/voice/stream` |
| `/providers` | Provider circuit-breaker detail | `/health/providers` |
| `/sessions` | Client-side (localStorage) session log — see gap note below | — |
| `/settings` | Dev-token issuance, manual token entry, environment info | `POST /v1/dev/token` |

## Architecture

```
src/
  app/                     route segments (App Router)
    (dashboard)/           shell layout + all console pages
  components/
    ui/                    hand-built shadcn-style primitives (button, card,
                            badge, input, skeleton, empty-state) — not the
                            shadcn CLI, for full control over the token system
    shell/                 sidebar, topbar, theme toggle, connection badge
    voice/                 waveform visualization
    dashboard/             known-issues panel
    providers/              provider health grid
  lib/
    api/                   client.ts (fetch wrapper, auth header, error
                            parsing), auth.ts (dev token), health.ts,
                            chat.ts (SSE parser)
    ws/                    voice-socket.ts (typed WS client), pcm.ts (mic
                            audio → PCM16 encoding/resampling)
    store/                 auth-context (token persistence), theme-provider,
                            query-provider, session-log (localStorage)
  hooks/                   use-mic-recorder, use-voice-session,
                            use-provider-health
  types/api.ts             types mirroring the gateway's actual schemas
  i18n/languages.ts         the 6 supported languages
```

## Root-caused integration issues

Full writeup lives in `src/components/dashboard/known-issues.tsx` and
renders on `/dashboard`. Summary:

- **`POST /v1/dev/token` → 404**: intentional. `gateway/app/routers/dev.py`
  disables this route whenever `ENVIRONMENT != "development"`, and the
  Render deployment correctly runs with `ENVIRONMENT=production`. This
  isn't a bug to route around — there's currently no production
  token-issuance endpoint to replace it with. The Settings page detects
  this specific 404 and explains it instead of showing a generic error.
- **`POST /v1/voice/complete` → 422**: client request-shape issue, not a
  backend bug. `Authorization` is a required FastAPI `Header(...)`
  parameter (`middleware/auth.py`), so a missing header fails request
  validation (422) before any route code runs — that's why it doesn't
  surface as a clean 401. `CompletionRequest` (`routers/voice.py`) also
  requires a body of exactly `{ "prompt": "..." }`. The shared API client
  (`lib/api/client.ts`) always attaches the header when a token exists,
  and every caller sends the exact schema, so this doesn't reproduce
  through the frontend.

## Known gaps (flagged, not silently worked around)

- **Mock STT/TTS**: the deployed gateway runs `MockSTT`/`MockTTS`. Real
  microphone audio (not valid UTF-8) always transcribes to
  `"[unrecognized audio]"` — see `gateway/app/services/voice/stt/mock_stt.py`.
  Voice Studio surfaces this directly rather than pretending it works,
  and adds a "type instead of speaking" input that uses `MockSTT`'s own
  documented test convention (UTF-8 bytes as the binary frame) to
  exercise the full pipeline meaningfully today. The "TTS audio" the
  pipeline returns is also literally text bytes, not decodable audio
  (`mock_tts.py`), so it's decoded and shown as a labeled text preview
  instead of being piped into the Web Audio API, which would just
  produce noise.
- **No session-history endpoint**: the gateway persists `VoiceSession`
  rows in Postgres but nothing under `routers/` reads them back. `/sessions`
  is a clearly-labeled client-side (localStorage) log of what this browser
  has seen, not real server-side history. A `GET /v1/sessions`-style
  endpoint is a backend addition, not something the frontend can fake.
- **Socket.IO client**: the original brief lists `socket.io-client`, but
  the gateway runs a plain FastAPI/Starlette WebSocket endpoint, not a
  Socket.IO server — a socket.io-client instance cannot complete a
  handshake against it. The frontend uses the native `WebSocket` API
  instead (`lib/ws/voice-socket.ts`).
- **Breadth vs. depth**: the brief describes a very large surface (billing,
  full admin panel, tenant analytics with historical charts, transcript
  editor/export, per-provider Grafana-style time series, etc). This pass
  prioritized a real, working core — auth, live text chat, a fully wired
  voice pipeline, provider health, and an honest sessions view — over
  stub pages with no real data behind them. The architecture (typed API
  layer, one hook per concern, shared UI primitives) is built to extend
  into those screens without rework.
- **Light mode**: wired end-to-end via CSS variables (`globals.css`) and
  `next-themes`, not just a non-functional toggle — but tuned less
  extensively than the dark (default) theme, which is where the design
  direction was aimed.
