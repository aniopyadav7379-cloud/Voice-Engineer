"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import { KeyRound, LogOut, Sparkles } from "lucide-react";
import { Topbar } from "@/components/shell/topbar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth, tokenClaims } from "@/lib/store/auth-context";
import { API_URL, WS_URL } from "@/lib/api/client";
import { DEV_TENANT_ID } from "@/lib/api/auth";
import { truncateMiddle } from "@/lib/utils";

const manualTokenSchema = z.object({
  token: z.string().min(10, "That doesn't look like a JWT."),
  tenantId: z.string().min(1, "Tenant ID is required to resolve tenant context."),
});
type ManualTokenForm = z.infer<typeof manualTokenSchema>;

const devTokenSchema = z.object({
  tenantId: z.string().min(1),
  quotaTier: z.string().min(1),
});
type DevTokenForm = z.infer<typeof devTokenSchema>;

export default function SettingsPage() {
  const { token, tenantId, quotaTier, isExpired, setToken, clearToken, requestDevToken, devTokenError, isRequestingDevToken } =
    useAuth();

  const manualForm = useForm<ManualTokenForm>({
    resolver: zodResolver(manualTokenSchema),
    defaultValues: { token: "", tenantId: DEV_TENANT_ID },
  });

  const devForm = useForm<DevTokenForm>({
    resolver: zodResolver(devTokenSchema),
    defaultValues: { tenantId: DEV_TENANT_ID, quotaTier: "standard" },
  });

  const claims = token ? tokenClaims(token) : null;

  return (
    <>
      <Topbar title="Settings" description="Auth, environment, and session configuration." />
      <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-signal-500" /> Issue a dev token
              </CardTitle>
              <CardDescription>Calls POST /v1/dev/token — only works when the gateway runs with ENVIRONMENT=development.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <form
              className="space-y-3"
              onSubmit={devForm.handleSubmit(async (values) => {
                await requestDevToken(values.tenantId, values.quotaTier);
              })}
            >
              <div>
                <label className="mb-1 block text-xs text-ink-400">Tenant ID</label>
                <Input {...devForm.register("tenantId")} placeholder={DEV_TENANT_ID} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-ink-400">Quota tier</label>
                <Input {...devForm.register("quotaTier")} placeholder="standard" />
              </div>
              <Button type="submit" disabled={isRequestingDevToken} className="w-full">
                {isRequestingDevToken ? "Requesting…" : "Request dev token"}
              </Button>
            </form>
            {devTokenError && (
              <div className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-xs leading-relaxed text-danger">
                {devTokenError}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-stream-500" /> Use an existing token
              </CardTitle>
              <CardDescription>Paste a JWT issued another way (e.g. ENVIRONMENT=development set temporarily).</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <form
              className="space-y-3"
              onSubmit={manualForm.handleSubmit((values) => {
                setToken(values.token.trim(), values.tenantId.trim());
                toast.success("Token saved for this browser.");
              })}
            >
              <div>
                <label className="mb-1 block text-xs text-ink-400">Bearer token</label>
                <Input {...manualForm.register("token")} placeholder="eyJhbGciOi..." />
                {manualForm.formState.errors.token && (
                  <p className="mt-1 text-xs text-danger">{manualForm.formState.errors.token.message}</p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs text-ink-400">Tenant ID</label>
                <Input {...manualForm.register("tenantId")} placeholder={DEV_TENANT_ID} />
              </div>
              <Button type="submit" variant="stream" className="w-full">
                Save token
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Current session</CardTitle>
              <CardDescription>Stored in this browser's localStorage only — never sent anywhere but the gateway.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {token ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={isExpired ? "danger" : "ok"} dot>
                    {isExpired ? "expired" : "active"}
                  </Badge>
                  {quotaTier && <Badge variant="neutral">tier: {quotaTier}</Badge>}
                </div>
                <dl className="space-y-1.5 text-xs">
                  <div className="flex justify-between gap-2">
                    <dt className="text-ink-400">Tenant ID</dt>
                    <dd className="font-mono text-ink-200">{tenantId}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-ink-400">Token</dt>
                    <dd className="font-mono text-ink-200">{truncateMiddle(token, 10)}</dd>
                  </div>
                  {claims?.exp !== undefined && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-ink-400">Expires</dt>
                      <dd className="font-mono text-ink-200">
                        {new Date(Number(claims.exp) * 1000).toLocaleString()}
                      </dd>
                    </div>
                  )}
                </dl>
                <Button variant="destructive" size="sm" onClick={clearToken}>
                  <LogOut className="h-3.5 w-3.5" /> Clear token
                </Button>
              </>
            ) : (
              <p className="text-xs text-ink-400">No token stored yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Environment</CardTitle>
              <CardDescription>Read from NEXT_PUBLIC_API_URL / NEXT_PUBLIC_WS_URL — never hardcoded.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <dl className="space-y-1.5 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-ink-400">API URL</dt>
                <dd className="font-mono text-ink-200">{API_URL || "(not set)"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-400">WS URL</dt>
                <dd className="font-mono text-ink-200">{WS_URL || "(not set)"}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
