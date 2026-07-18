import { WS_URL } from "@/lib/api/client";
import type { ClientControlMessage, ServerControlMessage } from "@/types/api";

/**
 * Thin client for GET/WS /v1/voice/stream (gateway/app/routers/voice_ws.py).
 *
 * Stack note: the brief calls for a Socket.IO client, but the gateway does
 * not run a Socket.IO server — it's a plain FastAPI/Starlette WebSocket
 * endpoint (`@router.websocket("/stream")`), which speaks the raw
 * WebSocket protocol, not Socket.IO's framing/handshake on top of it. A
 * socket.io-client instance cannot connect to this endpoint at all,
 * regardless of frontend config, so this uses the browser's native
 * WebSocket API instead. If a Socket.IO-compatible gateway is genuinely
 * required, that's a backend addition (a python-socketio ASGI app), not a
 * frontend fix.
 *
 * Auth note: the token travels as a `?token=` query param, not a header —
 * see `get_current_token_ws` in middleware/auth.py; browsers cannot set
 * custom headers during a WS handshake, so this is the gateway's own
 * documented design, not a workaround.
 */

export type VoiceSocketStatus = "idle" | "connecting" | "open" | "closed" | "error";

export interface VoiceSocketHandlers {
  onStatusChange?: (status: VoiceSocketStatus) => void;
  onServerMessage?: (msg: ServerControlMessage) => void;
  onAudioChunk?: (chunk: ArrayBuffer) => void;
}

export class VoiceSocket {
  private ws: WebSocket | null = null;
  private handlers: VoiceSocketHandlers;

  constructor(handlers: VoiceSocketHandlers = {}) {
    this.handlers = handlers;
  }

  get isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  connect(token: string): void {
    if (!WS_URL) {
      this.handlers.onStatusChange?.("error");
      this.handlers.onServerMessage?.({
        type: "error",
        detail: "NEXT_PUBLIC_WS_URL is not set — check your environment configuration.",
      });
      return;
    }

    this.handlers.onStatusChange?.("connecting");
    const url = `${WS_URL}/v1/voice/stream?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";

    ws.onopen = () => this.handlers.onStatusChange?.("open");

    ws.onmessage = (evt) => {
      if (typeof evt.data === "string") {
        try {
          const msg = JSON.parse(evt.data) as ServerControlMessage;
          this.handlers.onServerMessage?.(msg);
        } catch {
          // Non-JSON text frame — shouldn't happen per protocol; ignore.
        }
      } else if (evt.data instanceof ArrayBuffer) {
        this.handlers.onAudioChunk?.(evt.data);
      }
    };

    ws.onerror = () => this.handlers.onStatusChange?.("error");

    ws.onclose = (evt) => {
      this.handlers.onStatusChange?.("closed");
      // WS_1008_POLICY_VIOLATION is what the gateway sends for an
      // expired/invalid token or an unknown/suspended tenant — surface
      // that distinction rather than a generic "connection closed".
      if (evt.code === 1008) {
        this.handlers.onServerMessage?.({
          type: "error",
          detail: evt.reason || "Rejected by gateway (invalid token or tenant).",
        });
      }
    };

    this.ws = ws;
  }

  sendControl(msg: ClientControlMessage): void {
    if (!this.isOpen) return;
    this.ws!.send(JSON.stringify(msg));
  }

  sendAudioFrame(frame: ArrayBuffer): void {
    if (!this.isOpen) return;
    this.ws!.send(frame);
  }

  close(): void {
    this.ws?.close();
    this.ws = null;
  }
}
