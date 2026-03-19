function concatChunks(chunks: Uint8Array[], totalBytes: number): Uint8Array {
  const combined = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return combined;
}

async function cancelReader(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
  try {
    await reader.cancel();
  } catch {
    // Ignore cancellation failures; the caller is already handling the main error.
  }
}

export async function readStreamBytesWithinLimit(
  stream: ReadableStream<Uint8Array> | null,
  maxBytes: number,
  overflowMessage: string,
  signal?: AbortSignal
): Promise<Uint8Array> {
  if (stream === null) {
    return new Uint8Array(0);
  }

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      if (signal?.aborted) {
        throw signal.reason instanceof Error
          ? signal.reason
          : new DOMException('The operation was aborted.', 'AbortError');
      }

      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      if (value === undefined) {
        continue;
      }

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await cancelReader(reader);
        throw new Error(overflowMessage);
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return concatChunks(chunks, totalBytes);
}

export async function readRequestTextWithinLimit(
  request: Request,
  maxBytes: number,
  overflowMessage: string
): Promise<string> {
  if (request.body === null) {
    return '';
  }

  const bytes = await readStreamBytesWithinLimit(request.body, maxBytes, overflowMessage);
  return new TextDecoder().decode(bytes);
}