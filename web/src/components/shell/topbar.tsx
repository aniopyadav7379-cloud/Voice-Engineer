"use client";

import { User } from "lucide-react";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { ConnectionBadge } from "@/components/shell/connection-badge";
import { useAuth } from "@/lib/store/auth-context";
import { truncateMiddle } from "@/lib/utils";

export function Topbar({ title, description }: { title: string; description?: string }) {
  const { tenantId, token } = useAuth();

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-700 bg-ink-950/70 px-6 py-4 backdrop-blur-sm">
      <div>
        <h1 className="font-display text-lg font-semibold text-ink-50">{title}</h1>
        {description && <p className="text-xs text-ink-400">{description}</p>}
      </div>
      <div className="flex items-center gap-3">
        <ConnectionBadge />
        {token && tenantId && (
          <div className="hidden items-center gap-2 rounded-full border border-ink-600 bg-ink-800 px-3 py-1.5 text-xs text-ink-300 sm:flex">
            <User className="h-3.5 w-3.5" />
            <span className="font-mono">{truncateMiddle(tenantId)}</span>
          </div>
        )}
        <ThemeToggle />
      </div>
    </header>
  );
}
