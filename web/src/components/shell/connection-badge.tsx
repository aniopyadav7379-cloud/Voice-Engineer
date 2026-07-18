"use client";

import { Badge } from "@/components/ui/badge";
import { useGatewayHealth } from "@/hooks/use-provider-health";

export function ConnectionBadge() {
  const { data, isError, isLoading } = useGatewayHealth();

  if (isLoading) return <Badge variant="neutral">checking gateway…</Badge>;
  if (isError) return <Badge variant="danger" dot>gateway unreachable</Badge>;
  if (data?.status === "ok") return <Badge variant="ok" dot>gateway online</Badge>;
  return <Badge variant="warn" dot>unknown</Badge>;
}
