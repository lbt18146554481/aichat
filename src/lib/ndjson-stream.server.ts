/** Bridge a ReadableStream into an async iterable for NDJSON encoding. */
export async function* readableToAsyncIterable<T>(
  stream: ReadableStream<T>,
): AsyncGenerator<T> {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value !== undefined) yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

/** Stream async events as newline-delimited JSON (raw Response for server functions). */
export function eventsToNdjsonResponse(
  source: AsyncIterable<unknown>,
  init?: ResponseInit,
): Response {
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      try {
        for await (const ev of source) {
          controller.enqueue(enc.encode(`${JSON.stringify(ev)}\n`));
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(body, {
    ...init,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache",
      ...(init?.headers ?? {}),
    },
  });
}
