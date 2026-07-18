"use client";

import { useEffect, useState } from "react";
import { History, Info, Trash2 } from "lucide-react";
import { Topbar } from "@/components/shell/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { clearLoggedSessions, listLoggedSessions, type LoggedSession } from "@/lib/store/session-log";
import { languageLabel } from "@/i18n/languages";
import { truncateMiddle } from "@/lib/utils";

export default function SessionsPage() {
  const [sessions, setSessions] = useState<LoggedSession[]>([]);

  useEffect(() => {
    setSessions(listLoggedSessions());
    const interval = setInterval(() => setSessions(listLoggedSessions()), 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <Topbar title="Sessions" description="Voice sessions seen by this browser." />
      <div className="space-y-6 p-6">
        <Card className="border-warn/25 bg-warn/5">
          <CardContent className="flex gap-2.5">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
            <p className="text-xs leading-relaxed text-ink-300">
              The gateway stores <span className="font-mono">VoiceSession</span> rows in Postgres, but no route
              under <span className="font-mono">routers/</span> exposes a way to list or read them back — this is a
              gap in the current API, not something this page can work around. What&apos;s below is a client-side
              log built from the WebSocket events this browser has seen, kept in{" "}
              <span className="font-mono">localStorage</span>. Server-side history needs a new
              <span className="font-mono"> GET /v1/sessions</span>-style endpoint on the gateway.
            </p>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between">
          <p className="text-xs text-ink-400">{sessions.length} session(s) logged locally</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              clearLoggedSessions();
              setSessions([]);
            }}
            disabled={sessions.length === 0}
          >
            <Trash2 className="h-3.5 w-3.5" /> Clear log
          </Button>
        </div>

        {sessions.length === 0 ? (
          <EmptyState
            icon={History}
            title="No sessions yet"
            description="Start a session in Voice Studio and it'll show up here."
          />
        ) : (
          <div className="space-y-3">
            {sessions.map((s) => (
              <Card key={s.sessionId}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-ink-100">{truncateMiddle(s.sessionId, 8)}</span>
                      <Badge variant={s.endedAt ? "neutral" : "ok"} dot>
                        {s.endedAt ? "ended" : "active"}
                      </Badge>
                    </div>
                    <p className="text-xs text-ink-400">
                      Started {new Date(s.startedAt).toLocaleString()}
                      {s.endedAt && ` · ended ${new Date(s.endedAt).toLocaleTimeString()}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {s.languagesUsed.map((l) => (
                      <Badge key={l} variant="stream">
                        {languageLabel(l)}
                      </Badge>
                    ))}
                    <Badge variant="neutral">{s.turnCount} turn(s)</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
