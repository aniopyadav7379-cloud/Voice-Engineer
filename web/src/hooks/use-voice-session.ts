"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { VoiceSocket, type VoiceSocketStatus } from "@/lib/ws/voice-socket";
import { useMicRecorder } from "@/hooks/use-mic-recorder";
import type { ServerControlMessage } from "@/types/api";
import { logLanguageUsed, logSessionEnded, logSessionStarted, logTurn } from "@/lib/store/session-log";
import { tokenClaims } from "@/lib/store/auth-context";

export interface VoiceTurn {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  language?: string;
  kind: "transcript" | "mock-tts" | "status" | "error";
  timestamp: number;
}

let idCounter = 0;
const nextId = () => `turn-${++idCounter}-${Date.now()}`;

/**
 * Reassembles the mock-TTS binary stream back into text. As documented in
 * gateway/app/services/voice/tts/mock_tts.py, the "audio" the pipeline
 * returns today is literally UTF-8 text bytes (`[mock-tts:<lang>] ...`),
 * not decodable audio — so this decodes it for display instead of trying
 * to play it through the Web Audio API, which would just produce noise.
 *
 * IMPORTANT: mock_tts.py chunks that UTF-8 payload every 32 bytes, with no
 * regard for character boundaries. Devanagari/Bengali/Tamil/etc. characters
 * are 2-3 bytes each in UTF-8, so a chunk boundary frequently lands in the
 * middle of one. Decoding each chunk with a brand-new TextDecoder (as this
 * used to do) corrupts every such character into "�" — that's the garbled
 * Hindi/Telugu text you'd see mid-word. A single TextDecoder instance per
 * connection, called with `{ stream: true }`, buffers incomplete trailing
 * bytes and prepends them to the next chunk instead of losing them.
 */
function createMockAudioDecoder() {
  const decoder = new TextDecoder("utf-8");
  return (buf: ArrayBuffer) => decoder.decode(buf, { stream: true });
}

export function useVoiceSession(token: string | null) {
  const socketRef = useRef<VoiceSocket | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const [status, setStatus] = useState<VoiceSocketStatus>("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentLanguage, setCurrentLanguage] = useState("en");
  const [currentTargetLanguage, setCurrentTargetLanguage] = useState<string | null>(null);
  const [turns, setTurns] = useState<VoiceTurn[]>([]);
  const mockAudioBufferRef = useRef<string>("");
  const mockAudioDecoderRef = useRef<((buf: ArrayBuffer) => string) | null>(null);

  const pushTurn = useCallback((turn: Omit<VoiceTurn, "id" | "timestamp">) => {
    setTurns((prev) => [...prev, { ...turn, id: nextId(), timestamp: Date.now() }]);
  }, []);

  const handleServerMessage = useCallback(
    (msg: ServerControlMessage) => {
      switch (msg.type) {
        case "session_started": {
          sessionIdRef.current = msg.session_id;
          setSessionId(msg.session_id);
          setCurrentLanguage(msg.language);
          setCurrentTargetLanguage(msg.target_language ?? null);
          const targetNote = msg.target_language ? `, replying in ${msg.target_language}` : "";
          pushTurn({ role: "system", kind: "status", text: `Session started (${msg.language}${targetNote})` });
          const claims = token ? tokenClaims(token) : null;
          const tenantId = typeof claims?.tenant_id === "string" ? claims.tenant_id : null;
          logSessionStarted(msg.session_id, tenantId, msg.language);
          break;
        }
        case "transcript":
          setCurrentLanguage(msg.language);
          pushTurn({ role: "user", kind: "transcript", text: msg.text, language: msg.language });
          break;
        case "language_switched":
          setCurrentLanguage(msg.language);
          if ("target_language" in msg) setCurrentTargetLanguage(msg.target_language ?? null);
          pushTurn({ role: "system", kind: "status", text: `Language switched to ${msg.language}` });
          if (sessionIdRef.current) logLanguageUsed(sessionIdRef.current, msg.language);
          break;
        case "turn_complete": {
          const text = mockAudioBufferRef.current.trim();
          mockAudioBufferRef.current = "";
          if (text) {
            pushTurn({ role: "assistant", kind: "mock-tts", text });
          }
          if (sessionIdRef.current) logTurn(sessionIdRef.current);
          break;
        }
        case "session_ended":
          pushTurn({ role: "system", kind: "status", text: "Session ended" });
          if (sessionIdRef.current) logSessionEnded(sessionIdRef.current);
          sessionIdRef.current = null;
          setSessionId(null);
          break;
        case "error":
          pushTurn({ role: "system", kind: "error", text: msg.detail });
          break;
      }
    },
    [pushTurn, token]
  );

  const mic = useMicRecorder({
    onFrame: (frame) => {
      socketRef.current?.sendAudioFrame(frame);
    },
  });

  useEffect(() => {
    return () => {
      socketRef.current?.close();
      mic.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = useCallback(() => {
    if (!token) {
      pushTurn({ role: "system", kind: "error", text: "No auth token — issue one in Settings first." });
      return;
    }
    mockAudioDecoderRef.current = createMockAudioDecoder();
    const socket = new VoiceSocket({
      onStatusChange: setStatus,
      onServerMessage: handleServerMessage,
      onAudioChunk: (chunk) => {
        mockAudioBufferRef.current += mockAudioDecoderRef.current!(chunk);
      },
    });
    socket.connect(token);
    socketRef.current = socket;
  }, [token, handleServerMessage, pushTurn]);

  const disconnect = useCallback(() => {
    mic.stop();
    socketRef.current?.close();
    socketRef.current = null;
    setSessionId(null);
    setStatus("idle");
  }, [mic]);

  const startSession = useCallback(
    (languageHint: string, targetLanguage?: string | null) => {
      socketRef.current?.sendControl({
        type: "start_session",
        language_hint: languageHint,
        target_language: targetLanguage ?? null,
      });
    },
    []
  );

  const endSession = useCallback(() => {
    mic.stop();
    socketRef.current?.sendControl({ type: "end_session" });
  }, [mic]);

  const switchLanguage = useCallback((language: string, targetLanguage?: string | null) => {
    socketRef.current?.sendControl({
      type: "switch_language",
      language,
      ...(targetLanguage !== undefined ? { target_language: targetLanguage } : {}),
    });
  }, []);

  /** Sends typed text through the same pipeline a real utterance would use
   * — see the module docstring above. This is how "type instead of speak"
   * and pure text-to-speech testing work against the current mock STT. */
  const sendTextAsUtterance = useCallback((text: string) => {
    const bytes = new TextEncoder().encode(text);
    socketRef.current?.sendAudioFrame(bytes.buffer);
  }, []);

  const clearTranscript = useCallback(() => setTurns([]), []);

  return {
    status,
    sessionId,
    currentLanguage,
    currentTargetLanguage,
    turns,
    connect,
    disconnect,
    startSession,
    endSession,
    switchLanguage,
    sendTextAsUtterance,
    clearTranscript,
    mic,
  };
}
