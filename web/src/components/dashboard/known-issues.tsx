import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const ISSUES = [
  {
    id: "dev-token-404",
    title: "POST /v1/dev/token → 404",
    status: "By design, not a bug",
    body:
      "gateway/app/routers/dev.py returns 404 for this route whenever ENVIRONMENT != \"development\" " +
      "(see DEPLOYMENT.md §1). The deployed Render service runs with ENVIRONMENT=production — correct " +
      "for production — which intentionally disables this dev-only backdoor. There is currently no " +
      "production token-issuance endpoint in the gateway to replace it.",
    fix:
      "Frontend handling: Settings detects the 404 specifically and explains this instead of a generic " +
      "error, and offers manual token entry as a fallback. A real fix needs one of: (a) temporarily set " +
      "ENVIRONMENT=development on Render if this is still a staging deployment, or (b) add a real auth " +
      "endpoint to the gateway (backend change, out of scope here — flagging per your instructions rather " +
      "than making it silently).",
  },
  {
    id: "voice-complete-422",
    title: "POST /v1/voice/complete → 422",
    status: "Client request shape, not a backend bug",
    body:
      "Two separate causes produce the reported 422s. \"Authorization header required\": the Authorization " +
      "header is a required FastAPI Header(...) parameter (middleware/auth.py) — a missing header fails " +
      "request validation (422) before any route code runs, which is why it doesn't show up as a clean 401. " +
      "\"Missing prompt field\": CompletionRequest (routers/voice.py) requires a JSON body of exactly " +
      "{ \"prompt\": \"...\" } — any other field name or a missing body fails the same way.",
    fix:
      "Frontend handling: every request goes through one client (lib/api/client.ts) that always attaches " +
      "Authorization when a token exists, and the chat/voice services send bodies matching these schemas " +
      "exactly. No backend change needed here.",
  },
];

export function KnownIssuesPanel() {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warn" />
            Known integration issues
          </CardTitle>
          <CardDescription>Found during deployment testing — root-caused against the gateway source.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {ISSUES.map((issue) => (
          <div key={issue.id} className="rounded-xl border border-ink-700 bg-ink-900/60 p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-ink-100">{issue.title}</span>
              <Badge variant="warn">{issue.status}</Badge>
            </div>
            <p className="mb-2 text-xs leading-relaxed text-ink-400">{issue.body}</p>
            <p className="text-xs leading-relaxed text-ink-300">
              <span className="font-medium text-ink-100">Resolution: </span>
              {issue.fix}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
