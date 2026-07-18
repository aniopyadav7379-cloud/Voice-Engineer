/**
 * The gateway's WS protocol expects fixed-size PCM16 audio frames
 * (see voice_ws.py's docstring + UtteranceSegmenter). The browser's
 * AudioContext runs at whatever the device's native rate is (typically
 * 44100 or 48000 Hz) and delivers Float32 samples in [-1, 1], so both a
 * downsample to 16 kHz and a Float32 -> Int16 conversion happen here
 * before anything is sent over the socket.
 */

export const TARGET_SAMPLE_RATE = 16000;

export function downsampleTo16k(input: Float32Array, inputSampleRate: number): Float32Array {
  if (inputSampleRate === TARGET_SAMPLE_RATE) return input;
  const ratio = inputSampleRate / TARGET_SAMPLE_RATE;
  const outLength = Math.floor(input.length / ratio);
  const output = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const srcIndex = i * ratio;
    const lo = Math.floor(srcIndex);
    const hi = Math.min(lo + 1, input.length - 1);
    const frac = srcIndex - lo;
    output[i] = (input[lo] ?? 0) * (1 - frac) + (input[hi] ?? 0) * frac;
  }
  return output;
}

export function floatTo16BitPCM(input: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(input.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < input.length; i++) {
    const raw = input[i] ?? 0;
    const s = Math.max(-1, Math.min(1, raw));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

/** Root-mean-square amplitude, 0..1 — cheap enough to run every audio
 * frame for the live waveform / recording-level UI. */
export function rmsLevel(input: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < input.length; i++) {
    const v = input[i] ?? 0;
    sum += v * v;
  }
  return Math.sqrt(sum / Math.max(1, input.length));
}
