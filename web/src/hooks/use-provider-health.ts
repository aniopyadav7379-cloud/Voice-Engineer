"use client";

import { useQuery } from "@tanstack/react-query";
import { getHealth, getProviderHealth } from "@/lib/api/health";

export function useGatewayHealth() {
  return useQuery({
    queryKey: ["gateway-health"],
    queryFn: ({ signal }) => getHealth(signal),
    refetchInterval: 15_000,
  });
}

export function useProviderHealth() {
  return useQuery({
    queryKey: ["provider-health"],
    queryFn: ({ signal }) => getProviderHealth(signal),
    refetchInterval: 10_000,
  });
}
