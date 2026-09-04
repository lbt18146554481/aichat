/** Read a streaming NDJSON Response body event-by-event. */
export async function consumeNdjsonResponse<T>(
  response: Response,
  onEvent: (ev: T) => void,
): Promise<void> {
  if (!response.ok) {
    throw new Error(await response.text().catch(() => `HTTP ${response.status}`));
  }
  if (!response.body) throw new Error("stream response has no body");

  const reader = response.body.getReader();
  const dec = new TextDecoder();
  let buf = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line) onEvent(JSON.parse(line) as T);
      }
    }
    const tail = buf.trim();
    if (tail) onEvent(JSON.parse(tail) as T);
  } finally {
    reader.releaseLock();
  }
}
