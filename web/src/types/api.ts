// Mirrors the actual response/request shapes in gateway/app/routers/*.py and
// gateway/app/services/provider_router.py. Kept in one file so a backend
// contract change only needs updating here.

export interface DevTokenRequest {
  tenant_id: string;
  quota_tier?: string;
}

export interface DevTokenResponse {
  access_token: string;
  token_type: "bearer";
}

export interface HealthResponse {
  status: "ok";
}

/** Shape returned by GET /health/providers — one entry per configured
 * provider in `provider_priority`. The gateway doesn't publish a formal
 * schema for this (it's `-> dict` in health.py), so this is inferred from
 * ProviderRouter.health_snapshot() / the circuit-breaker fields it tracks.
 * Treat fields as optional and fall back gracefully if the backend's
 * actual shape drifts. */
export interface ProviderHealthEntry {
  state?: "closed" | "open" | "half_open" | string;
  consecutive_failures?: number;
  last_error?: string | null;
  last_checked_at?: string | null;
  [key: string]: unknown;
}

export type ProviderHealthResponse = Record<string, ProviderHealthEntry | string>;

export interface CompletionRequest {
  prompt: string;
}

/** SSE frame kinds streamed by POST /v1/voice/complete. */
export type CompletionStreamEvent =
  | { event: "provider"; data: string }
  | { event: "message"; data: string }
  | { event: "done"; data: string };

// ---- WebSocket /v1/voice/stream protocol (gateway/app/routers/voice_ws.py) ----

export type ClientControlMessage =
  | { type: "start_session"; language_hint: string; target_language?: string | null }
  | { type: "switch_language"; language: string; target_language?: string | null }
  | { type: "end_session" };

export type ServerControlMessage =
  | { type: "session_started"; session_id: string; language: string; target_language?: string | null }
  | { type: "transcript"; text: string; language: string }
  | { type: "language_switched"; language: string; target_language?: string | null }
  | { type: "turn_complete" }
  | { type: "session_ended" }
  | { type: "error"; detail: string };

export interface LanguageOption {
  code: string;
  label: string;
  nativeLabel: string;
}
