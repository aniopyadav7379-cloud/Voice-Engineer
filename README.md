# Voice Platform Gateway — Stage 1 + Stage 2 + Stage 3

Stage 1: FastAPI gateway skeleton — JWT auth, tenant resolution, Redis
token-bucket rate limiting, multi-provider LLM routing with circuit-breaker
failover (PRD Phase 1).

Stage 2: real-time voice pipeline over WebSocket — VAD-based utterance
segmentation, STT, language identification with hysteresis, and TTS,
wired through the same provider router and rate limiter as stage 1 (PRD
Phase 2).

Stage 3: conversation memory — Qdrant-backed retrieval with hard tenant/
session isolation, and an agent orchestrator implementing the
retrieve-augment-generate-persist pattern (PRD Phase 3, memory half).

**Important stack note**: the PRD (section 5.2, section 8) specifies
Mastra for agentic routing. Mastra has no Python SDK — it's TypeScript-
only — and this gateway is FastAPI/Python. `AgentOrchestrator` implements
the same retrieve → augment → generate → persist pattern Mastra/LangGraph
agents follow, in plain Python, since there's no way to run an actual
Mastra agent inside this service without a cross-language RPC boundary
the PRD doesn't call for. This is a real inconsistency in the PRD's stack
choice worth raising with whoever owns that document — not something to
quietly work around.

## Middleware chain (HTTP)

```
request -> get_current_token (auth.py, no DB)
         -> get_tenant_context (tenant.py, 1 Postgres lookup)
         -> enforce_rate_limit (rate_limit.py, 1 Redis Lua call)
         -> route handler -> provider_router.complete()
```

## Voice pipeline (WebSocket, `/v1/voice/stream`)

```
binary audio frame -> EnergyVAD.is_speech()
                    -> UtteranceSegmenter (buffers until silence run)
                    -> STTAdapter.transcribe()          [utterance boundary]
                    -> LanguageIdentifier.observe()      [hysteresis model]
                    -> ProviderRouter.complete()          [same as stage 1]
                    -> TTSAdapter.synthesize()
                    -> binary audio frames back to client
```

Protocol — JSON text control messages plus binary PCM16 audio frames:

```
client -> server: {"type": "start_session", "language_hint": "en"}
client -> server: {"type": "switch_language", "language": "hi"}
client -> server: {"type": "end_session"}
client -> server: <binary PCM16 frames>

server -> client: {"type": "session_started", "session_id": "...", "language": "en"}
server -> client: {"type": "transcript", "text": "...", "language": "en"}
server -> client: {"type": "language_switched", "language": "hi"}
server -> client: <binary audio frames>              # TTS reply
server -> client: {"type": "turn_complete"}
server -> client: {"type": "error", "detail": "..."}
```

Each stage is an independent, swappable component — `EnergyVAD`,
`STTAdapter`, `LanguageIdentifier`, `TTSAdapter` — so a real VAD/STT/TTS
provider replaces exactly one file each, not the handler logic.

## Conversation memory (stage 3)

```
user_text -> ConversationMemory.retrieve_context()   [Qdrant, tenant+session filtered]
          -> AgentOrchestrator._build_prompt()         [context + user_text]
          -> ProviderRouter.complete()                 [same as stage 1]
          -> ConversationMemory.store_turn() x2         [user turn + assistant reply]
```

`_process_utterance` in `voice_ws.py` now calls `AgentOrchestrator.handle_turn()`
instead of `ProviderRouter.complete()` directly — memory retrieval/storage
is fully transparent to the WebSocket handler.

**Tenant isolation is a hard filter, not a ranking preference**: every
Qdrant query is scoped by `tenant_id` AND `session_id` via
`models.Filter(must=[...])`, not just sorted by relevance. Verified with a
test that deliberately collided session IDs across two different tenants
and confirmed tenant A's retrieval never saw tenant B's turns — see
"Verified, not just written" below.

## Run it

```bash
cp gateway/.env.example gateway/.env
docker-compose up --build
```

Seed a test tenant (dev only):

```bash
docker-compose exec gateway python -m app.scripts_seed_dev_tenant
```

Get a dev token (only works when ENVIRONMENT=development):

```bash
curl -X POST localhost:8000/v1/dev/token \
  -H "Content-Type: application/json" \
  -d '{"tenant_id": "00000000-0000-0000-0000-000000000001"}'
```

**HTTP completion endpoint** (stage 1):

```bash
curl -N -X POST localhost:8000/v1/voice/complete \
  -H "Authorization: Bearer <token from above>" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "hello"}'
```

**WebSocket voice endpoint** (stage 2) — token goes in the query string
since browsers can't set custom headers during the WS handshake:

```
ws://localhost:8000/v1/voice/stream?token=<token from above>
```

Send `{"type": "start_session", "language_hint": "en"}` as a text frame,
then binary PCM16 frames (16-bit signed, mono, consistent frame size —
e.g. 20ms @ 16kHz = 640 bytes/frame). With no real STT/TTS keys configured
this runs on `MockSTT`/`MockTTS`, so it's fully testable without external
services — see the pipeline diagram above for exactly what happens to
each frame.

With no `OPENAI_API_KEY` set, both endpoints route to the built-in mock
LLM provider. Set `OPENAI_API_KEY` in `.env` to route to real OpenAI
instead.

Check provider circuit state:

```bash
curl localhost:8000/health/providers
```

## Design decisions made (and why)

- **Token bucket over sliding-window-log** for rate limiting — O(1) per
  check, one Redis key per tenant, naturally allows short bursts. See
  docstring in `app/services/rate_limiter.py`.
- **Atomic Lua script** for the rate-limit check-and-decrement — avoids a
  read-modify-write race across concurrent gateway replicas.
- **Failover is mid-request, not just next-request**: `ProviderRouter`
  pulls the first chunk from a provider before committing to it as "the"
  stream, so a provider that fails immediately doesn't leave the caller
  with a half-open connection.
- **Circuit breaker state is in-memory**, not Redis-backed, for stage 1.
  Flagged as a scaling gap in `provider_router.py` — fine for one replica,
  needs to move to Redis before running >1 gateway instance in production
  (same pattern as the rate limiter).
- **JWT carries `tenant_id` + `quota_tier`** so auth stays DB-free; only
  the tenant stage touches Postgres, keeping combined auth+tenant overhead
  close to the PRD's <5ms budget (not yet load-tested — see Open Items).
- **Energy-based VAD, not webrtcvad/Silero** — zero compiled dependencies,
  trivially testable, but worse in noisy environments. See docstring in
  `app/services/voice/vad.py`. Swapping it out is a one-file change.
- **STT operates on complete utterances, not word-by-word partials** —
  simpler to implement correctly; real streaming STT (Deepgram) emits
  interim results as the user is still talking, which is a real latency
  improvement but a separate piece of work (`TranscriptResult` would need
  an `is_final` flag). See docstring in `app/services/voice/stt/base.py`.
- **LID uses Unicode script-range matching, not a statistical model** —
  fast, dependency-free, accurate for pure-script text in all 5 languages.
  It does NOT solve romanized code-switching (the PRD's own example,
  "Mujhe Hyderabad ka weather batao", is transliterated Hindi in Latin
  script and will be seen as English). Closing that gap needs a
  fastText-style LID model — flagged, not built. See docstring in
  `app/services/voice/lid.py`.
- **LID hysteresis is tested, not just implemented**: a language only
  flips after `min_consecutive` (default 2) same-language detections
  above `min_confidence` (default 0.6) — verified against the PRD's own
  example sentences in the integration pass, including that a single
  stray word does NOT flip the session language.
- **VoiceSession writes are batched to session-start/language-switch/
  session-end**, not per-frame or per-utterance, to stay inside the
  latency budget.
- **"Mastra agent" is a plain-Python orchestrator**, not literal Mastra —
  see the stack note at the top of this README.
- **Embeddings are a deterministic hashing mock**, not a real semantic
  model — same trade-off pattern as MockSTT/MockTTS/MockProvider. It
  preserves relative similarity ordering (shared vocabulary scores
  higher) well enough to prove retrieval logic is correct, but does not
  capture real semantic meaning. Swap for OpenAI's text-embedding-3-small
  or similar before this touches real traffic; `ConversationMemory` only
  depends on the `Embedder` interface, so nothing else changes.
- **Qdrant runs in embedded local mode (`:memory:`) by default**, not
  against a server — zero extra services needed for local dev, same
  demo philosophy as the mock LLM/STT/TTS providers. `docker-compose`
  overrides this to point at a real Qdrant container
  (`QDRANT_LOCATION=http://qdrant:6333`).

## Verified, not just written

Every piece below was actually run against real Postgres + real Redis
before being called done, not just eyeballed:
- JWT round-trip and tamper detection
- Provider router: immediate failover on first bad response, circuit
  opens at exactly `PROVIDER_FAILURE_THRESHOLD`
- VAD energy detection and the utterance-segmenter state machine
  (speech/silence/flush transitions, buffer reset after flush)
- LID script detection against the PRD's own 5-language example sentences
  — this surfaced and fixed a real bug (confidence exceeding 1.0 for
  Indic scripts, because vowel signs are combining marks, not
  `isalpha()`-true characters, and were undercounted in the denominator)
- LID hysteresis: single stray utterance does not flip the session
  language; two consecutive confident same-language utterances do
- Full WebSocket pipeline end to end: start_session -> audio frames
  through VAD/segmenter/STT -> transcript -> LLM reply -> TTS audio ->
  explicit language switch -> session end — with the resulting Postgres
  row checked afterward (`language_history` correctly shows `en,hi`,
  `status` correctly `closed`)
- Mock embedder: same text produces the same vector, disjoint-vocabulary
  text scores near-zero cosine similarity, overlapping-vocabulary text
  scores higher — the property retrieval logic actually depends on
- Conversation memory tenant isolation: stored turns for two different
  tenants under a **deliberately collided session ID** and confirmed
  retrieval for tenant A never returned tenant B's data — this is the
  case that would actually matter in production, not just the happy path
- Agent orchestrator: ran two turns in the same session and confirmed
  turn 1 has zero retrieved context, turn 2 correctly retrieves turn 1
  and the augmented prompt (with retrieved context) is what actually
  reaches the LLM call — verified by asserting on the mock provider's
  echoed output, not by reading the code and assuming it's right
- Found and fixed a real bug this way, not in review: `ensure_collection()`
  only runs inside the app's lifespan startup event, and the first version
  of the end-to-end test didn't trigger ASGI lifespan (TestClient needs
  `with client:`), so the Qdrant collection didn't exist yet on first
  query. This is a testing-harness gotcha specifically — `uvicorn`
  triggers lifespan automatically in real deployment — but it's the kind
  of thing that's easy to paper over by re-running until it passes rather
  than understanding why it failed.

## Explicitly deferred (do not assume done)

- Alembic migrations — tables are created via `create_all` on startup in
  dev mode only. Needs a real migration pipeline before staging.
- Groq / Gemini / Azure OpenAI adapters — only OpenAI + mock are wired up
  for the LLM router.
- Real STT/TTS adapters (Deepgram, Whisper streaming, ElevenLabs, Azure
  Speech) — only mock adapters exist; interfaces are ready for them.
- Interim/partial STT results — current STT interface is utterance-final
  only.
- Romanized code-switching in LID — script-based detection only; needs a
  statistical LID model.
- Real embeddings — mock hashing embedder only; swap for a real model
  before production traffic (see design decisions above).
- Real Mastra/LangGraph agent framework — plain-Python orchestrator only;
  no tool-calling, planning loops, or multi-step reasoning. See the stack
  note at the top of this README on why Mastra itself isn't used.
- Memory retention/expiry policy — turns are stored indefinitely per
  session; no TTL, summarization, or pruning strategy exists yet for
  long-running sessions.
- Multi-region session silos, Kubernetes manifests, CI/CD — PRD Phase 4.
- Load testing against the <1.2s p95 and <5ms middleware-overhead targets
  has not been run — only functional correctness has been verified, not
  performance under the PRD's 100+ concurrent session target. Memory
  retrieval adds a Qdrant round-trip per utterance turn that hasn't been
  latency-profiled.
- `audioop` (used by `EnergyVAD`) is deprecated in Python 3.13 and removed
  in later versions; fine on the `python:3.12-slim` base image this
  project uses, but flagged for replacement (e.g. with a small numpy RMS
  calculation) before any Python version bump.

