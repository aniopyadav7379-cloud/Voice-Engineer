import { apiGet } from "./client";
import type { HealthResponse, ProviderHealthResponse } from "@/types/api";

export function getHealth(signal?: AbortSignal) {
  return apiGet<HealthResponse>("/health", { signal });
}

export function getProviderHealth(signal?: AbortSignal) {
  return apiGet<ProviderHealthResponse>("/health/providers", { signal });
}
