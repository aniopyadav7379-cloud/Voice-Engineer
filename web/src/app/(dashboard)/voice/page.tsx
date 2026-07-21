"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Phone, PhoneOff, Send, Languages, Info, Bot, User as UserIcon } from "lucide-react";
import { Topbar } from "@/components/shell/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { Waveform } from "@/components/voice/waveform";
import { useAuth } from "@/lib/store/auth-context";
import { useVoiceSession } from "@/hooks/use-voice-session";
import { LANGUAGES } from "@/i18n/languages";
import { cn } from "@/lib/utils";

export default function VoiceStudioPage() {
  const { token } = useAuth();
  const session = useVoiceSession(token);
  const [languageHint, setLanguageHint] = useState("en");
  const [targetLanguage, setTargetLanguage] = useState("");  // "" = reply in the same language you speak
  const [typedText, setTypedText] = useState("");

  const connected = session.status === "open";
  const sessionActive = Boolean(session.sessionId);

  return (
    <>
      <Topbar
        title="Voice Studio"
        description="Speech ⇄ Speech and Speech → Text over the /v1/voice/stream WebSocket."
      />
      <div className="grid flex-1 grid-cols-1 gap-6 p-6 lg:grid-cols-[360px_1fr]">
        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="font-display text-sm font-medium text-ink-50">Connection</p>
                <Badge variant={connected ? "ok" : session.status === "error" ? "danger" : "neutral"} dot>
                  {session.status}
                </Badge>
              </div>

              {!connected ? (
                <Button className="w-full" onClick={session.connect} disabled={!token}>
                  <Phone className="h-4 w-4" /> Connect
                </Button>
              ) : (
                <Button variant="destructive" className="w-full" onClick={session.disconnect}>
                  <PhoneOff className="h-4 w-4" /> Disconnect
                </Button>
              )}
              {!token && <p className="text-xs text-danger">Set a token in Settings first.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4">
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs text-ink-400">
                  <Languages className="h-3.5 w-3.5" /> Language
                </label>
                <Select
                  value={languageHint}
                  onChange={(e) => setLanguageHint(e.target.value)}
                  disabled={sessionActive}
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label} — {l.nativeLabel}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs text-ink-400">
                  <Languages className="h-3.5 w-3.5" /> Reply in
                </label>
                <Select
                  value={targetLanguage}
                  onChange={(e) => setTargetLanguage(e.target.value)}
                  disabled={sessionActive}
                >
                  <option value="">Same as what I speak</option>
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label} — {l.nativeLabel}
                    </option>
                  ))}
                </Select>
                <p className="mt-1 text-[11px] text-ink-500">
                  E.g. speak Telugu, set this to Hindi — every reply is translated into Hindi regardless
                  of what you speak.
                </p>
              </div>

              {!sessionActive ? (
                <Button
                  variant="stream"
                  className="w-full"
                  disabled={!connected}
                  onClick={() => session.startSession(languageHint, targetLanguage || null)}
                >
                  Start session
                </Button>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-ink-400">Active language</span>
                    <Badge variant="stream">{session.currentLanguage}</Badge>
                  </div>
                  {session.currentTargetLanguage && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-ink-400">Replying in</span>
                      <Badge variant="stream">{session.currentTargetLanguage}</Badge>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {LANGUAGES.map((l) => (
                      <button
                        key={l.code}
                        onClick={() => session.switchLanguage(l.code, targetLanguage || null)}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                          session.currentLanguage === l.code
                            ? "border-stream-500 bg-stream-500/10 text-stream-500"
                            : "border-ink-600 text-ink-300 hover:border-ink-400"
                        )}
                      >
                        {l.code}
                      </button>
                    ))}
                  </div>
                  <Button variant="outline" className="w-full" onClick={session.endSession}>
                    End session
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3">
              <p className="font-display text-sm font-medium text-ink-50">Microphone</p>
              <Waveform
                levels={session.mic.levels}
                idle={session.mic.status !== "recording"}
                color="signal"
              />
              <div className="flex items-center justify-between text-xs">
                <span className="text-ink-400">{session.mic.status}</span>
                {session.mic.status === "recording" ? (
                  <Button size="sm" variant="destructive" onClick={session.mic.stop}>
                    <MicOff className="h-3.5 w-3.5" /> Stop
                  </Button>
                ) : (
                  <Button size="sm" onClick={session.mic.start} disabled={!sessionActive}>
                    <Mic className="h-3.5 w-3.5" /> Speak
                  </Button>
                )}
              </div>
              {session.mic.status === "denied" && (
                <p className="text-xs text-danger">Microphone permission denied — allow it in your browser and retry.</p>
              )}
              {!sessionActive && <p className="text-xs text-ink-400">Start a session before speaking.</p>}
            </CardContent>
          </Card>

          <Card className="border-warn/25 bg-warn/5">
            <CardContent className="flex gap-2.5">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
              <p className="text-xs leading-relaxed text-ink-300">
                The deployed gateway runs <span className="font-mono">MockSTT</span> /{" "}
                <span className="font-mono">MockTTS</span> — real microphone audio transcribes to{" "}
                <span className="font-mono">&quot;[unrecognized audio]&quot;</span> until real STT/TTS adapters are
                wired in (see DEPLOYMENT.md §2.4). Use <span className="font-medium text-ink-100">Type instead</span>{" "}
                below to exercise the full pipeline meaningfully today.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="flex min-h-0 flex-col gap-4">
          <Card className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 space-y-3 overflow-y-auto p-6">
              {session.turns.length === 0 ? (
                <EmptyState
                  icon={Mic}
                  title="No conversation yet"
                  description="Connect, start a session, then speak or type to begin."
                />
              ) : (
                <AnimatePresence initial={false}>
                  {session.turns.map((turn) => {
                    if (turn.kind === "status") {
                      return (
                        <motion.p
                          key={turn.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="text-center text-[11px] font-mono uppercase tracking-wide text-ink-500"
                        >
                          {turn.text}
                        </motion.p>
                      );
                    }
                    if (turn.kind === "error") {
                      return (
                        <motion.div
                          key={turn.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger"
                        >
                          {turn.text}
                        </motion.div>
                      );
                    }
                    const isUser = turn.role === "user";
                    return (
                      <motion.div
                        key={turn.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={cn("flex gap-3", isUser && "flex-row-reverse")}
                      >
                        <div
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                            isUser ? "bg-ink-700 text-ink-200" : "bg-stream-500/15 text-stream-500"
                          )}
                        >
                          {isUser ? <UserIcon className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                        </div>
                        <div
                          className={cn(
                            "max-w-[75%] space-y-1 rounded-2xl px-4 py-3 text-sm",
                            isUser ? "bg-ink-700 text-ink-50" : "border border-ink-700 bg-ink-900 text-ink-100"
                          )}
                        >
                          {turn.kind === "mock-tts" && (
                            <Badge variant="stream" className="mb-1">
                              mock TTS — text preview
                            </Badge>
                          )}
                          <p>{turn.text}</p>
                          {turn.language && (
                            <p className="text-[10px] font-mono uppercase tracking-wide text-ink-500">
                              {turn.language}
                            </p>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              )}
            </div>

            <div className="border-t border-ink-700 p-4">
              <div className="flex items-center gap-2">
                <Input
                  value={typedText}
                  onChange={(e) => setTypedText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && typedText.trim()) {
                      session.sendTextAsUtterance(typedText.trim());
                      setTypedText("");
                    }
                  }}
                  placeholder={sessionActive ? "Type instead of speaking…" : "Start a session to enable this"}
                  disabled={!sessionActive}
                />
                <Button
                  disabled={!sessionActive || !typedText.trim()}
                  onClick={() => {
                    session.sendTextAsUtterance(typedText.trim());
                    setTypedText("");
                  }}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
