import Link from "next/link";
import { ArrowRight, MessageSquare, Mic, Type, Volume2, AudioWaveform, Github } from "lucide-react";
import { LANGUAGES } from "@/i18n/languages";

const MODES = [
  {
    icon: Mic,
    title: "Speech → Speech",
    body: "Mic in, streaming transcription, an AI reply, spoken back — with barge-in to interrupt mid-reply.",
  },
  {
    icon: Type,
    title: "Speech → Text",
    body: "Live transcription with a speaker timeline, an editable transcript, and one-click export.",
  },
  {
    icon: Volume2,
    title: "Text → Speech",
    body: "Type a line, hear it back, choose a voice, download the audio.",
  },
  {
    icon: MessageSquare,
    title: "Text → Text",
    body: "A modern streaming chat with markdown, code highlighting, and full history.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-dvh bg-ink-950 bg-grid-fade text-ink-100">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-signal-500/15 text-signal-500">
            <AudioWaveform className="h-4 w-4" />
          </div>
          <span className="font-display text-sm font-semibold">Voice Platform</span>
        </div>
        <nav className="flex items-center gap-3">
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="hidden items-center gap-1.5 text-xs text-ink-400 hover:text-ink-200 sm:flex"
          >
            <Github className="h-3.5 w-3.5" /> Source
          </a>
          <Link
            href="/dashboard"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-signal-500 px-4 text-xs font-medium text-ink-950 shadow-glow hover:bg-signal-600"
          >
            Open console <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-4xl px-6 pb-16 pt-10 text-center sm:pt-20">
        <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-ink-600 bg-ink-800/60 px-3 py-1 text-[11px] font-mono uppercase tracking-wider text-ink-300">
          <span className="h-1.5 w-1.5 rounded-full bg-ok" /> Gateway live on Render
        </span>
        <h1 className="font-display text-4xl font-bold leading-[1.1] tracking-tight text-ink-50 sm:text-6xl">
          Voice AI that switches languages
          <br />
          <span className="text-signal-500">mid-sentence.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-ink-400 sm:text-base">
          A real-time, multilingual voice gateway for enterprise conversations — English and five Indic
          languages, sub-1.2s round trip, provider failover built in.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            href="/voice"
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-signal-500 px-6 text-sm font-medium text-ink-950 shadow-glow hover:bg-signal-600"
          >
            Try Voice Studio <Mic className="h-4 w-4" />
          </Link>
          <Link
            href="/chat"
            className="inline-flex h-11 items-center gap-2 rounded-lg border border-ink-600 px-6 text-sm font-medium text-ink-100 hover:bg-ink-800"
          >
            Try Text Chat <MessageSquare className="h-4 w-4" />
          </Link>
        </div>

        <div className="mx-auto mt-14 flex max-w-md items-end justify-center gap-[3px]" aria-hidden>
          {Array.from({ length: 40 }).map((_, i) => (
            <span
              key={i}
              className="w-[3px] animate-bar-bounce rounded-full bg-signal-500/70"
              style={{
                height: `${16 + ((i * 37) % 40)}px`,
                animationDelay: `${(i % 12) * 70}ms`,
              }}
            />
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-10">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {MODES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-2xl border border-ink-700 bg-ink-800/50 p-5">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-stream-500/15 text-stream-500">
                <Icon className="h-4 w-4" />
              </div>
              <h3 className="mb-1.5 font-display text-sm font-semibold text-ink-50">{title}</h3>
              <p className="text-xs leading-relaxed text-ink-400">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="rounded-2xl border border-ink-700 bg-ink-800/40 p-6 text-center sm:p-8">
          <p className="mb-4 text-xs font-mono uppercase tracking-wider text-ink-400">Supported languages</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {LANGUAGES.map((l) => (
              <span
                key={l.code}
                className="rounded-full border border-ink-600 bg-ink-900 px-3 py-1.5 text-xs text-ink-200"
              >
                {l.label} <span className="text-ink-500">· {l.nativeLabel}</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-ink-800 px-6 py-6 text-center text-[11px] text-ink-500">
        Frontend console for the Voice Platform Gateway — connects to a deployed FastAPI backend via
        NEXT_PUBLIC_API_URL / NEXT_PUBLIC_WS_URL.
      </footer>
    </div>
  );
}
