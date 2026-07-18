"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  MessageSquare,
  Mic,
  Activity,
  History,
  Settings,
  AudioWaveform,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/chat", label: "Text Chat", icon: MessageSquare },
  { href: "/voice", label: "Voice Studio", icon: Mic },
  { href: "/providers", label: "Provider Health", icon: Activity },
  { href: "/sessions", label: "Sessions", icon: History },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-ink-700 bg-ink-900/60 px-3 py-4 backdrop-blur-sm md:flex">
      <Link href="/dashboard" className="flex items-center gap-2 px-2 pb-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-signal-500/15 text-signal-500">
          <AudioWaveform className="h-4 w-4" />
        </div>
        <div className="leading-tight">
          <p className="font-display text-sm font-semibold text-ink-50">Voice Platform</p>
          <p className="text-[10px] font-mono uppercase tracking-wider text-ink-400">gateway console</p>
        </div>
      </Link>

      <nav className="flex flex-1 flex-col gap-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname?.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active ? "bg-ink-800 text-ink-50" : "text-ink-300 hover:bg-ink-800/60 hover:text-ink-100"
              )}
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-signal-500" />
              )}
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="rounded-xl border border-ink-700 bg-ink-800/50 p-3">
        <p className="text-[11px] leading-relaxed text-ink-400">
          Connected to the deployed Render gateway. Endpoint and env config live in{" "}
          <span className="font-mono text-ink-300">Settings</span>.
        </p>
      </div>
    </aside>
  );
}
