/**
 * Every request to the gateway goes through here. Two things this file
 * exists to guarantee, because both were the actual root cause of the
 * integration issues found during deployment testing:
 *
 * 1. The `Authorization: Bearer <token>` header is attached whenever a
 *    token is present — every non-health route requires it, and a missing
 *    header fails FastAPI's own request validation (422) before any
 *    application code runs, which is why it can look like a generic
 *    "validation error" rather than a clean 401.
 * 2. Request bodies match the gateway's Pydantic schemas exactly
 *    (e.g. `{ prompt: string }` for /v1/voice/complete) — a mismatched
 *    field name is the other common source of a 422.
 */

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "");
export const WS_URL = (process.env.NEXT_PUBLIC_WS_URL ?? "").replace(/\/+$/, "");

export class ApiError extends Error {
  status: number;
  detail: unknown;

  constructor(status: number, detail: unknown, message?: string) {
    super(message ?? `Request failed with status ${status}`);
    this.status = status;
    this.detail = detail;
  }
}

function authHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Parses the gateway's uniform error envelope: `{"error": "..."}`
 * (see the `http_exception_handler` in gateway/app/main.py), while still
 * handling FastAPI's default validation-error shape
 * (`{"detail": [{"msg": ..., "loc": [...]}]}`) for 422s, since those are
 * raised before the custom handler ever sees them. */
async function parseErrorBody(res: Response): Promise<unknown> {
  try {
    const body = await res.json();
    if (typeof body?.error === "string") return body.error;
    if (Array.isArray(body?.detail)) {
      return body.detail
        .map((d: { loc?: string[]; msg?: string }) => {
          const field = d.loc?.slice(1).join(".") || "request";
          return `${field}: ${d.msg}`;
        })
        .join("; ");
    }
    if (typeof body?.detail === "string") return body.detail;
    return body;
  } catch {
    return res.statusText;
  }
}

interface RequestOptions {
  token?: string | null;
  signal?: AbortSignal;
}

export async function apiGet<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "GET",
    headers: { ...authHeaders(opts.token ?? null) },
    signal: opts.signal,
  });
  if (!res.ok) throw new ApiError(res.status, await parseErrorBody(res));
  return res.json();
}

export async function apiPost<T>(
  path: string,
  body: unknown,
  opts: RequestOptions = {}
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(opts.token ?? null),
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  if (!res.ok) throw new ApiError(res.status, await parseErrorBody(res));
  return res.json();
}

/** Raw Response for endpoints that stream (SSE) rather than return JSON. */
export async function apiPostStream(
  path: string,
  body: unknown,
  opts: RequestOptions = {}
): Promise<Response> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...authHeaders(opts.token ?? null),
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  if (!res.ok) throw new ApiError(res.status, await parseErrorBody(res));
  return res;
}
