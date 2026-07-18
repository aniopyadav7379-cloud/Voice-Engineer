"use client";

import { cn } from "@/lib/utils";

interface WaveformProps {
  /** 0..1 amplitude values, most recent last. When omitted, renders an
   * ambient idle animation instead of real levels. */
  levels?: number[];
  bars?: number;
  color?: "signal" | "stream";
  className?: string;
  idle?: boolean;
}

const colorClass = {
  signal: "bg-signal-500",
  stream: "bg-stream-500",
};

export function Waveform({ levels, bars = 32, color = "signal", className, idle }: WaveformProps) {
  const values =
    levels && levels.length > 0
      ? levels.slice(-bars)
      : Array.from({ length: bars }, () => 0.08);

  const padded = Array.from({ length: bars }, (_, i) => {
    const offset = bars - values.length;
    return i >= offset ? values[i - offset] : 0.06;
  });

  return (
    <div className={cn("flex h-16 items-center gap-[3px]", className)}>
      {padded.map((v, i) => (
        <span
          key={i}
          className={cn(
            "w-[3px] min-h-[4px] rounded-full origin-center transition-[height] duration-75",
            colorClass[color],
            idle && "animate-bar-bounce"
          )}
          style={{
            height: `${Math.max(6, Math.min(1, v ?? 0.06) * 64)}px`,
            opacity: idle ? 0.5 : 0.4 + Math.min(1, v ?? 0) * 0.6,
            animationDelay: idle ? `${i * 45}ms` : undefined,
          }}
        />
      ))}
    </div>
  );
}
