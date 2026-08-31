/** Consume a ReadableStream of events from a TanStack Start server function. */
export async function consumeEventStream<T>(
  stream: ReadableStream<T>,
  onEvent: (ev: T) => void,
): Promise<void> {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value !== undefined) onEvent(value);
    }
  } finally {
    reader.releaseLock();
  }
}
