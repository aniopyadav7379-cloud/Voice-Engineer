"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import { Send, RotateCcw, Trash2, AlertCircle, Bot, User as UserIcon } from "lucide-react";
import { Topbar } from "@/components/shell/topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useAuth } from "@/lib/store/auth-context";
import { streamCompletion } from "@/lib/api/chat";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  provider?: string;
  status: "streaming" | "done" | "error";
  error?: string;
}

let msgCounter = 0;
const nextMsgId = () => `msg-${++msgCounter}`;

export default function ChatPage() {
  const { token } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastPromptRef = useRef<string>("");

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const run = useCallback(
    async (prompt: string) => {
      if (!token) {
        setMessages((prev) => [
          ...prev,
          {
            id: nextMsgId(),
            role: "assistant",
            text: "No auth token set. Add one in Settings, then retry.",
            status: "error",
          },
        ]);
        return;
      }

      lastPromptRef.current = prompt;
      const assistantId = nextMsgId();
      setMessages((prev) => [...prev, { id: assistantId, role: "assistant", text: "", status: "streaming" }]);
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        for await (const chunk of streamCompletion(prompt, token, controller.signal)) {
          if (chunk.event === "provider") {
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, provider: chunk.data } : m))
            );
          } else if (chunk.event === "message") {
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, text: m.text + chunk.data } : m))
            );
          } else if (chunk.event === "done") {
            setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, status: "done" } : m)));
          }
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        const message =
          err instanceof ApiError
            ? `${err.status}: ${typeof err.detail === "string" ? err.detail : "Request failed."}`
            : err instanceof Error
              ? err.message
              : "Something went wrong.";
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, status: "error", error: message } : m))
        );
      } finally {
        setIsStreaming(false);
      }
    },
    [token]
  );

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    setMessages((prev) => [...prev, { id: nextMsgId(), role: "user", text: trimmed, status: "done" }]);
    setInput("");
    run(trimmed);
  };

  const handleRetry = () => run(lastPromptRef.current);

  const handleStop = () => {
    abortRef.current?.abort();
    setIsStreaming(false);
  };

  return (
    <>
      <Topbar title="Text Chat" description="Text → Text over POST /v1/voice/complete, streamed via SSE." />
      <div className="flex flex-1 flex-col p-6">
        <Card className="flex flex-1 flex-col overflow-hidden">
          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-6">
            {messages.length === 0 ? (
              <EmptyState
                icon={Bot}
                title="Nothing here yet"
                description="Ask something below — replies stream in token by token as the gateway forwards them."
              />
            ) : (
              <AnimatePresence initial={false}>
                {messages.map((m) => (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn("flex gap-3", m.role === "user" && "flex-row-reverse")}
                  >
                    <div
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                        m.role === "user" ? "bg-ink-700 text-ink-200" : "bg-signal-500/15 text-signal-500"
                      )}
                    >
                      {m.role === "user" ? <UserIcon className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                    </div>
                    <div
                      className={cn(
                        "max-w-[75%] rounded-2xl px-4 py-3 text-sm",
                        m.role === "user" ? "bg-ink-700 text-ink-50" : "bg-ink-900 border border-ink-700 text-ink-100"
                      )}
                    >
                      {m.status === "error" ? (
                        <div className="flex items-start gap-2 text-danger">
                          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                          <div>
                            <p>{m.error}</p>
                            <Button variant="outline" size="sm" className="mt-2" onClick={handleRetry}>
                              <RotateCcw className="h-3 w-3" /> Retry
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {m.provider && (
                            <Badge variant="signal" className="mb-2">
                              via {m.provider}
                            </Badge>
                          )}
                          <div className="prose-chat">
                            <ReactMarkdown>{m.text || (m.status === "streaming" ? "…" : "")}</ReactMarkdown>
                          </div>
                          {m.status === "streaming" && (
                            <span className="mt-1 inline-flex gap-1">
                              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-signal-500" />
                              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-signal-500 [animation-delay:150ms]" />
                              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-signal-500 [animation-delay:300ms]" />
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>

          <div className="border-t border-ink-700 p-4">
            <div className="flex items-end gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Type a message… (Shift+Enter for a new line)"
                rows={2}
                className="flex-1"
              />
              {isStreaming ? (
                <Button variant="destructive" onClick={handleStop}>
                  Stop
                </Button>
              ) : (
                <Button onClick={handleSend} disabled={!input.trim()}>
                  <Send className="h-4 w-4" /> Send
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMessages([])}
                disabled={messages.length === 0}
                aria-label="Clear conversation"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
