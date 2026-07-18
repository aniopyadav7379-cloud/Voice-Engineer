"use client";

import { useCallback, useRef, useState } from "react";
import { downsampleTo16k, floatTo16BitPCM, rmsLevel } from "@/lib/ws/pcm";

const BUFFER_SIZE = 4096;

export type MicStatus = "idle" | "requesting" | "recording" | "denied" | "error";

interface UseMicRecorderOptions {
  onFrame: (frame: ArrayBuffer) => void;
}

/**
 * Uses a ScriptProcessorNode rather than an AudioWorklet — deliberate
 * simplicity trade-off for this stage. ScriptProcessorNode is deprecated
 * but still broadly supported and doesn't require shipping/loading a
 * separate worklet module; swap to AudioWorkletNode before this goes to
 * production, since it runs off the main thread and won't glitch under
 * UI load the way this can.
 */
export function useMicRecorder({ onFrame }: UseMicRecorderOptions) {
  const [status, setStatus] = useState<MicStatus>("idle");
  const [levels, setLevels] = useState<number[]>([]);
  const contextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const stop = useCallback(() => {
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    contextRef.current?.close().catch(() => {});
    processorRef.current = null;
    sourceRef.current = null;
    streamRef.current = null;
    contextRef.current = null;
    setStatus("idle");
    setLevels([]);
  }, []);

  const start = useCallback(async () => {
    setStatus("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const context = new AudioCtx();
      contextRef.current = context;

      const source = context.createMediaStreamSource(stream);
      sourceRef.current = source;

      const processor = context.createScriptProcessor(BUFFER_SIZE, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (evt) => {
        const input = evt.inputBuffer.getChannelData(0);
        const level = rmsLevel(input);
        setLevels((prev) => [...prev.slice(-63), level]);

        const downsampled = downsampleTo16k(input, context.sampleRate);
        const pcm = floatTo16BitPCM(downsampled);
        onFrame(pcm);
      };

      source.connect(processor);
      // Some browsers require the processor connected to a destination to
      // actually fire onaudioprocess, even though we discard the output.
      processor.connect(context.destination);

      setStatus("recording");
    } catch (err) {
      const isDenied =
        err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "SecurityError");
      setStatus(isDenied ? "denied" : "error");
    }
  }, [onFrame]);

  return { status, levels, start, stop };
}
