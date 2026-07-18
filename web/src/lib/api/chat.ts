import { apiPostStream } from "./client";

export interface CompletionChunk {
  event: "provider" | "message" | "done";
  data: string;
}

/**
 * Streams POST /v1/voice/complete (see gateway/app/routers/voice.py's
 * `sse()` generator) and yields one CompletionChunk per SSE frame:
 *   event: provider\ndata: <provider name>\n\n     -> once, first frame
 *   data: <token/chunk text>\n\n                    -> repeated
 *   event: done\ndata: {}\n\n                        -> once, last frame
 *
 * Frames without an explicit `event:` line are treated as "message".
 */
export async function* streamCompletion(
  prompt: string,
  token: string | null,
  signal?: AbortSignal
): AsyncGenerator<CompletionChunk> {
  const res = await apiPostStream("/v1/voice/complete", { prompt }, { token, signal });
  const body = res.body;
  if (!body) throw new Error("Response has no readable body (SSE unsupported in this runtime)");

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sepIndex: number;
    while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
      const rawFrame = buffer.slice(0, sepIndex);
      buffer = buffer.slice(sepIndex + 2);

      let event: CompletionChunk["event"] = "message";
      let data = "";
      for (const line of rawFrame.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim() as CompletionChunk["event"];
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (data.length > 0 || event === "done") yield { event, data };
    }
  }
}
