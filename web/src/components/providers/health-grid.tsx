"use client";

import { AlertTriangle, CircleCheck, CircleOff, CircleSlash } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useProviderHealth } from "@/hooks/use-provider-health";
import type { ProviderHealthEntry } from "@/types/api";

function stateBadge(state: string | undefined) {
  switch (state) {
    case "closed":
      return (
        <Badge variant="ok" dot>
          <CircleCheck className="h-3 w-3" /> healthy
        </Badge>
      );
    case "open":
      return (
        <Badge variant="danger" dot>
          <CircleOff className="h-3 w-3" /> circuit open
        </Badge>
      );
    case "half_open":
      return (
        <Badge variant="warn" dot>
          <AlertTriangle className="h-3 w-3" /> probing
        </Badge>
      );
    default:
      return (
        <Badge variant="neutral">
          <CircleSlash className="h-3 w-3" /> {state ?? "unknown"}
        </Badge>
      );
  }
}

export function ProviderHealthGrid() {
  const { data, isLoading, isError, error } = useProviderHealth();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <EmptyState
        icon={CircleOff}
        title="Couldn't reach /health/providers"
        description={error instanceof Error ? error.message : "Check NEXT_PUBLIC_API_URL in Settings."}
      />
    );
  }

  const entries = Object.entries(data ?? {});
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={CircleSlash}
        title="No providers reported"
        description="The gateway returned an empty provider health snapshot."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {entries.map(([name, raw]) => {
        const entry: ProviderHealthEntry = typeof raw === "string" ? { state: raw } : raw;
        return (
          <Card key={name}>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-display text-sm font-medium capitalize text-ink-50">
                  {name.replace(/_/g, " ")}
                </p>
                {stateBadge(entry.state)}
              </div>
              <dl className="space-y-1 text-xs text-ink-400">
                {typeof entry.consecutive_failures === "number" && (
                  <div className="flex justify-between">
                    <dt>Consecutive failures</dt>
                    <dd className="font-mono text-ink-200">{entry.consecutive_failures}</dd>
                  </div>
                )}
                {entry.last_error && (
                  <div className="flex justify-between gap-2">
                    <dt>Last error</dt>
                    <dd className="truncate font-mono text-ink-300" title={String(entry.last_error)}>
                      {String(entry.last_error)}
                    </dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
