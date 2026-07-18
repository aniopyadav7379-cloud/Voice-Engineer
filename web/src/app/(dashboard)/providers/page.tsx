"use client";

import { RefreshCw } from "lucide-react";
import { Topbar } from "@/components/shell/topbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ProviderHealthGrid } from "@/components/providers/health-grid";
import { useProviderHealth } from "@/hooks/use-provider-health";

export default function ProvidersPage() {
  const { data, refetch, isFetching, dataUpdatedAt } = useProviderHealth();

  return (
    <>
      <Topbar
        title="Provider Health"
        description="GET /health/providers — polled every 10s. Reflects each LLM provider's circuit-breaker state."
      />
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <p className="text-xs text-ink-400">
            {dataUpdatedAt ? `Last updated ${new Date(dataUpdatedAt).toLocaleTimeString()}` : "Loading…"}
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh now
          </Button>
        </div>

        <ProviderHealthGrid />

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Failover order</CardTitle>
              <CardDescription>
                From the PRD's provider_priority — the router walks this list on failure until one succeeds.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-wrap gap-2 text-xs">
              {["openai", "groq", "gemini", "azure_openai"].map((p, i) => (
                <li
                  key={p}
                  className="flex items-center gap-2 rounded-full border border-ink-600 bg-ink-900 px-3 py-1.5 font-mono text-ink-200"
                >
                  <span className="text-ink-500">{i + 1}.</span> {p}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Raw response</CardTitle>
              <CardDescription>Unmodified JSON from the gateway, for debugging.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-lg border border-ink-700 bg-ink-950 p-4 font-mono text-xs text-ink-300">
              {JSON.stringify(data ?? {}, null, 2)}
            </pre>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
