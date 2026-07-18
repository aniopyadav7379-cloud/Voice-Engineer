import { ApiError, apiPost } from "./client";
import type { DevTokenRequest, DevTokenResponse } from "@/types/api";

export const DEV_TENANT_ID = "00000000-0000-0000-0000-000000000001";

export class DevTokenDisabledError extends Error {
  constructor() {
    super(
      "POST /v1/dev/token returns 404 because gateway/app/routers/dev.py " +
        "disables this route whenever ENVIRONMENT != 'development'. The " +
        "deployed Render service is running with ENVIRONMENT=production " +
        "(the correct setting for production, per DEPLOYMENT.md), which " +
        "means the dev-token backdoor is intentionally closed — this is " +
        "not a bug to patch around. There is currently no replacement " +
        "production auth-issuance endpoint in the gateway, so a token " +
        "has to come from somewhere else (set ENVIRONMENT=development on " +
        "the Render service temporarily, or paste a token issued another " +
        "way in Settings)."
    );
    this.name = "DevTokenDisabledError";
  }
}

export async function issueDevToken(
  req: DevTokenRequest,
  signal?: AbortSignal
): Promise<DevTokenResponse> {
  try {
    return await apiPost<DevTokenResponse>("/v1/dev/token", req, { signal });
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) {
      throw new DevTokenDisabledError();
    }
    throw e;
  }
}

/** Decodes the unsigned parts of a JWT for display purposes only — never
 * used for verification, the gateway is the sole source of truth for
 * whether a token is valid. */
export function decodeTokenPayload(token: string): Record<string, unknown> | null {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function isTokenExpired(token: string): boolean {
  const payload = decodeTokenPayload(token);
  const exp = payload?.exp;
  if (typeof exp !== "number") return false;
  return Date.now() >= exp * 1000;
}
