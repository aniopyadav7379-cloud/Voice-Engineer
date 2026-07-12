# Deployment Guide — Voice Platform Gateway

This is a checklist of everything that must change between the current
dev-mode scaffold (stages 1-3) and a real deployment. Everything here was
flagged as a shortcut or a deferred item while building — this document
just collects those in one place, organized by what breaks and when.

**Read this before deploying, not after something breaks in production.**
Nothing here is optional; each item is marked with what happens if you
skip it.

---

## 1. Config / environment variables to change

| Variable | Dev value | Production requirement | If you skip it |
|---|---|---|---|
| `JWT_SECRET` | `change-me-in-production` | Real random secret (32+ bytes), from a secrets manager, never committed | Anyone can forge tenant tokens and access any tenant's data |
| `ENVIRONMENT` | `development` | `production` | Disables dev-only `/v1/dev/token` endpoint and the `create_all` startup hook (see §2) |
| `DATABASE_URL` | local postgres | Managed Postgres (RDS/Cloud SQL/etc), with a real password, `sslmode=require` | — |
| `REDIS_URL` | local redis | Managed Redis (ElastiCache/etc), with AUTH enabled, TLS if crossing a network boundary | Rate limiting and circuit-breaker state have no access control |
| `QDRANT_LOCATION` | `:memory:` | Real Qdrant cluster URL (`http://qdrant:6333` in compose, or a managed Qdrant Cloud endpoint) | `:memory:` mode holds all vectors in-process — every restart wipes all conversation memory for every tenant, and it doesn't survive multiple gateway replicas at all |
| `OPENAI_API_KEY` / `GROQ_API_KEY` / `GEMINI_API_KEY` / `AZURE_OPENAI_API_KEY` | blank | Real keys, from a secrets manager | Falls back to the mock provider — conversations get echoed nonsense, silently, with no error |
| `ACCESS_TOKEN_TTL_SECONDS` | 3600 | Reconsider based on your session length; shorter is safer since the token travels in the WebSocket URL query string (see §5) | — |
| CORS `allow_origins` (`app/main.py`) | `["*"]` | Your actual frontend origin(s) only | Any website can make authenticated requests using a user's token if it leaks |

Copy `.env.example` to `.env` and fill in every value above — don't deploy
with any default still in place.

---

## 2. Code changes required before production traffic

These aren't config flips — they're places where the code takes a
deliberate dev-mode shortcut that will actively break things at
production scale or on restart.

### 2.1 Replace `create_all` with real migrations
`app/main.py`'s lifespan hook calls `Base.metadata.create_all()` when
`ENVIRONMENT=development`. This is disabled outside dev, which means **as
shipped, nothing creates your tables in production** — you'd deploy to an
empty database with no error until the first query fails.

**Before deploying**: set up Alembic (`alembic init`, generate an initial
migration from the current models in `app/db/models.py`), and run
`alembic upgrade head` as a release step in your CI/CD pipeline — not on
app startup.

### 2.2 Move circuit-breaker state to Redis
`ProviderRouter`'s circuit-breaker state (`app/services/provider_router.py`)
is an in-memory Python dict, scoped to one process. With more than one
gateway replica, each replica trips its own circuit independently — a
provider can look "down" to replica A while replica B keeps sending it
traffic, because they don't share state.

**Before running >1 replica**: move `_CircuitState` to Redis, using the
same atomic-Lua-script pattern already used for rate limiting in
`app/services/rate_limiter.py`. This is flagged in the code, not silently
left broken.

### 2.3 Same problem, session-local pipeline state
`_ConnectionState` in `app/routers/voice_ws.py` (the LID hysteresis window,
the utterance segmenter buffer) lives in the WebSocket connection's memory
for the life of that one connection. This is actually fine for a single
session — WebSocket connections are inherently sticky to one process
already — but it does mean:
- **No mid-call failover**: if the gateway process handling a WebSocket
  connection crashes or restarts, that voice session drops. The client
  has to reconnect and start a new session; there's no session handoff
  to another replica.
- **Sticky routing required if you scale to >1 replica**: your load
  balancer / Nginx config needs session affinity (sticky sessions) for
  WebSocket connections, or a client's reconnect could land on a replica
  with no memory of the in-progress conversation. (Long-term conversation
  memory in Qdrant survives this fine — it's specifically the *live pipeline
  state mid-utterance* that doesn't.)

### 2.4 Swap every "Mock" adapter for a real one
Everything currently runs on mocks by design, so the whole stack is
demoable with zero external dependencies. That means, as shipped, **real
users get no real speech recognition, no real speech output, and no real
model responses** unless you do this:

| Interface | File | Mock in place | Real adapter needed |
|---|---|---|---|
| `STTAdapter` | `app/services/voice/stt/mock_stt.py` | Decodes UTF-8 text directly (test-only trick) | Deepgram or Whisper streaming |
| `TTSAdapter` | `app/services/voice/tts/mock_tts.py` | Encodes text as fake "audio" bytes | ElevenLabs or Azure Speech |
| `Embedder` | `app/services/embeddings/mock_embedder.py` | Deterministic hashing, no real semantics | OpenAI `text-embedding-3-small` or similar |
| `ProviderAdapter` (Groq/Gemini/Azure) | `app/services/providers/` | Only OpenAI + mock exist | Implement `ProviderAdapter` for each, register in `build_provider_router()` |

Each of these is a one-file swap behind an existing interface — nothing
else in the codebase needs to change. But **the swap itself has not been
done**; don't assume it has.

### 2.5 Energy-based VAD → real VAD
`app/services/voice/vad.py` uses simple RMS-energy thresholding. It works
for the demo and the unit tests, but it will misfire in real noisy
environments (background chatter, traffic, echo) — either cutting off
speech early or triggering on non-speech noise. Swap `EnergyVAD` for
`webrtcvad` or a Silero VAD model before relying on this with real
microphone input. One-file change (`is_speech()` is the only method
anything else calls).

### 2.6 `audioop` deprecation
`EnergyVAD` uses the stdlib `audioop` module, deprecated in Python 3.13
and removed entirely in later versions. Fine on the `python:3.12-slim`
base image this project currently uses — but if you bump the Python
version in the Dockerfile, replace the RMS calculation with a small numpy
implementation first, or the build will break.

---

## 3. Infrastructure

- **Kubernetes (EKS per the PRD)**: the current `docker-compose.yml` is
  dev/single-host only. No k8s manifests exist yet — Deployments,
  Services, an Ingress with TLS termination and WebSocket support (make
  sure your ingress controller has `proxy-read-timeout`/idle-timeout
  configured generously for long-lived voice sessions), HorizontalPodAutoscaler
  tuned to your actual CPU/connection-count profile, and readiness/liveness
  probes hitting `/health`.
- **TLS everywhere**: local dev runs plain HTTP/WS. Production needs TLS
  terminated at the ingress/load balancer at minimum (`wss://` for the
  voice endpoint, `https://` for the REST endpoint), and ideally between
  internal services too.
- **Secrets management**: nothing in this codebase reads from a secrets
  manager — it reads plain environment variables via `pydantic-settings`.
  Wire your deployment to inject `JWT_SECRET`, database credentials, and
  provider API keys from AWS Secrets Manager / Vault / equivalent, not
  from a committed `.env` file or plain Kubernetes ConfigMap.
- **Postgres**: needs connection pooling sized for your replica count
  (`pool_size=20, max_overflow=10` in `app/db/base.py` is a per-process
  default — multiply by replica count and check against your DB's actual
  max connections), and a backup/PITR strategy — none exists in this repo.
- **Qdrant**: needs to run as a real service (not `:memory:`) with
  persistent storage and its own backup strategy — conversation memory
  is currently held with zero durability guarantees beyond `:memory:`'s
  process lifetime.

---

## 4. Observability

The PRD calls for per-stage, per-tenant latency tracking via
Prometheus/Grafana. **None of that instrumentation exists in the code
yet** — there's no Prometheus client wired in, no `/metrics` endpoint, and
no per-stage timing captured anywhere in the request/voice pipeline. This
is PRD Phase 4 scope and hasn't been started. Before you deploy and expect
to observe latency, error rate, or provider health over time (rather than
just the point-in-time `/health/providers` snapshot that exists today),
this needs to be built.

---

## 5. Security items specific to this codebase

- **JWT in the WebSocket query string**: `get_current_token_ws` reads the
  token from `?token=...` because browsers can't set custom headers during
  a WS handshake. Query strings end up in access logs, proxy logs, and
  browser history. Mitigate with short token TTLs (§1) and make sure your
  ingress/load balancer access logs don't retain full query strings, or
  redact the `token` param specifically.
- **`/v1/dev/token`**: returns 404 when `ENVIRONMENT != development`, which
  is the only thing preventing it from being a live token-issuance
  backdoor in production. Double-check this guard survives whatever
  config templating your deployment pipeline does — don't let a
  misconfigured `ENVIRONMENT` var silently re-enable it.
- **CORS wildcard**: see §1 — this must be tightened before deploy.
- **Provider API keys at rest**: currently read from env vars only; if
  you later add per-tenant provider keys (the PRD mentions tenant-level
  provider config in its data requirements section), those need
  encryption at rest in Postgres, which nothing in this codebase
  implements yet.

---

## 6. What has and hasn't been load-tested

Everything in this codebase has been functionally verified — real
Postgres, real Redis, real Qdrant local mode, full pipeline runs,
tenant-isolation checks. **None of it has been load-tested.** Specific
unverified claims from the PRD:

- <1.2s p95 STT→TTS round trip — not measured, and can't be until real
  STT/TTS adapters replace the mocks (§2.4), since mock latency is
  meaningless.
- <5ms middleware overhead — not measured under concurrent load.
- 100+ concurrent WebSocket sessions per instance — not tested at all;
  the single-process, in-memory pipeline state (§2.3) means this number
  is bounded by one process's connection-handling capacity, which hasn't
  been profiled.

Run Locust or k6 against a real deployment with real adapters before
treating any PRD success metric as met.

---

## Quick pre-deploy checklist

- [ ] `JWT_SECRET` set from a secrets manager, not the default
- [ ] `ENVIRONMENT=production`
- [ ] Alembic migrations run, `create_all` not relied upon
- [ ] Circuit-breaker state moved to Redis if running >1 replica
- [ ] Sticky WebSocket routing configured if running >1 replica
- [ ] Real STT, TTS, embedding, and LLM provider adapters wired in
- [ ] `EnergyVAD` swapped for a real VAD if using real microphone input
- [ ] CORS origins restricted to actual frontend domain(s)
- [ ] TLS terminated for both HTTPS and WSS
- [ ] Qdrant running as a real, persistent service — not `:memory:`
- [ ] Postgres connection pool sized for actual replica count
- [ ] Backup/PITR strategy in place for Postgres and Qdrant
- [ ] Prometheus/Grafana instrumentation built (currently doesn't exist)
- [ ] Load test run against real adapters before trusting PRD latency/
      throughput numbers
