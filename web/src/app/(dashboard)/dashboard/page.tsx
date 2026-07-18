"use client";

import Link from "next/link";
import { MessageSquare, Mic, Activity, ArrowRight } from "lucide-react";
import { Topbar } from "@/components/shell/topbar";
import { Card, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProviderHealthGrid } from "@/components/providers/health-grid";
import { KnownIssuesPanel } from "@/components/dashboard/known-issues";
import { useAuth } from "@/lib/store/auth-context";

const QUICK_LINKS = [
  {
    href: "/chat",
    icon: MessageSquare,
    title: "Text Chat",
    description: "Text → Text against POST /v1/voice/complete, streamed token by token.",
    accent: "signal" as const,
  },
  {
    href: "/voice",
    icon: Mic,
    title: "Voice Studio",
    description: "Speech ⇄ Speech and Speech → Text over the /v1/voice/stream WebSocket.",
    accent: "stream" as const,
  },
  {
    href: "/providers",
    icon: Activity,
    title: "Provider Health",
    description: "LLM provider circuit-breaker state, polled from /health/providers.",
    accent: "signal" as const,
  },
];

export default function DashboardPage() {
  const { token } = useAuth();

  return (
    <>
      <Topbar title="Overview" description="Gateway status, provider health, and quick actions." />
      <div className="space-y-6 p-6">
        {!token && (
          <Card className="border-signal-500/30 bg-signal-500/5">
            <CardContent className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>No auth token yet</CardTitle>
                <CardDescription>Chat and Voice Studio need a bearer token to call the gateway.</CardDescription>
              </div>
              <Link href="/settings">
                <Button size="sm">
                  Go to Settings <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {QUICK_LINKS.map(({ href, icon: Icon, title, description, accent }) => (
            <Link key={href} href={href}>
              <Card className="group h-full transition-colors hover:border-ink-500">
                <CardContent className="space-y-3">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                      accent === "signal" ? "bg-signal-500/15 text-signal-500" : "bg-stream-500/15 text-stream-500"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <CardTitle className="mb-1">{title}</CardTitle>
                    <CardDescription>{description}</CardDescription>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-ink-300 group-hover:text-ink-100">
                    Open <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        <div>
          <h2 className="mb-3 font-display text-sm font-semibold text-ink-200">Provider health</h2>
          <ProviderHealthGrid />
        </div>

        <KnownIssuesPanel />
      </div>
    </>
  );
}
