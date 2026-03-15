import { AnalysisReportSchema, AnalysisProgressEventSchema, type AnalysisReport, type AnalysisProgressEvent } from '@extensionchecker/shared';

export type { AnalysisProgressEvent };

export type ProgressCallback = (event: AnalysisProgressEvent) => void;

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

// Total time budget for a single analysis request (connect + stream).
// Set below Cloudflare's 60-second wall-time limit.
const ANALYZE_TIMEOUT_MS = 55_000;

function mapFetchError(error: unknown): never {
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    throw new Error('Analysis timed out. The extension may be too large or the server is busy. Please try again.');
  }
  throw error;
}

/**
 * Parses a `Retry-After` header value (seconds delay or HTTP date) into a
 * human-readable wait string, e.g. "in 42 seconds" or "after 2:15 PM".
 * Returns null when the header is absent or unparseable.
 */
function parseRetryAfter(headers: Headers): string | null {
  const raw = headers.get('retry-after');
  if (!raw) {
    return null;
  }

  // RFC 7231 §7.1.3: value is either a delay-seconds integer or an HTTP-date.
  const asSeconds = Number(raw.trim());
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    const secs = Math.ceil(asSeconds);
    if (secs === 0) {
      return 'shortly';
    }
    if (secs < 60) {
      return `in ${secs} second${secs === 1 ? '' : 's'}`;
    }
    const mins = Math.ceil(secs / 60);
    return `in ${mins} minute${mins === 1 ? '' : 's'}`;
  }

  // HTTP-date: parse and format as local time.
  const asDate = new Date(raw);
  if (!Number.isNaN(asDate.getTime())) {
    return `after ${asDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  }

  return null;
}

/**
 * Converts an HTTP error status into a plain-language message suitable for
 * display to end users. Used when the response body is absent, non-JSON
 * (e.g. a Cloudflare HTML error page), or lacks an `error` field.
 */
function friendlyHttpError(status: number, headers: Headers): Error {
  if (status === 401) {
    return new Error('Access denied. Authentication is required to use this service.');
  }
  if (status === 403) {
    return new Error('Access denied. You do not have permission to use this service.');
  }
  if (status === 408) {
    return new Error('The request timed out. Please try again.');
  }
  if (status === 413) {
    return new Error('The extension package is too large to analyze. The maximum supported size is 80 MB.');
  }
  if (status === 429) {
    const wait = parseRetryAfter(headers);
    return new Error(
      wait
        ? `Too many requests. Please try again ${wait}.`
        : 'Too many requests. Please wait a moment and try again.'
    );
  }
  if (status >= 500) {
    return new Error('The analysis service is temporarily unavailable. Please try again in a moment.');
  }
  return new Error('Analysis request failed. Please check your input and try again.');
}

async function parseReportResponse(response: Response): Promise<AnalysisReport> {
  const rawBody = await response.text();
  let body: unknown = null;

  if (rawBody.length > 0) {
    try {
      body = JSON.parse(rawBody) as unknown;
    } catch {
      if (!response.ok) {
        throw friendlyHttpError(response.status, response.headers);
      }

      throw new Error('Backend returned invalid JSON.');
    }
  }

  if (!response.ok) {
    // Prefer the backend's own error message (already user-friendly for most cases).
    // Fall back to a friendly status-based message when the body is absent or malformed.
    const backendMessage = typeof body === 'object'
      && body !== null
      && 'error' in body
      && typeof body.error === 'string'
      ? body.error
      : null;
    throw backendMessage ? new Error(backendMessage) : friendlyHttpError(response.status, response.headers);
  }

  const parsed = AnalysisReportSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error('Backend returned a malformed report payload.');
  }

  return parsed.data;
}

async function readSSEStream(response: Response, onProgress?: ProgressCallback): Promise<AnalysisReport> {
  const body = response.body;
  if (!body) {
    throw new Error('Backend returned an empty streaming response.');
  }

  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  let report: AnalysisReport | null = null;
  let streamError: string | null = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (value) {
      buffer += value;
    }

    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() ?? '';

    for (const block of blocks) {
      let eventType = '';
      let data = '';

      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) {
          eventType = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          data = line.slice(5).trim();
        }
      }

      if (!eventType || !data) {
        continue;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(data);
      } catch {
        continue;
      }

      if (eventType === 'progress' && onProgress) {
        const validated = AnalysisProgressEventSchema.safeParse(parsed);
        if (validated.success) {
          onProgress(validated.data);
        }
      } else if (eventType === 'result') {
        const validated = AnalysisReportSchema.safeParse(parsed);
        if (validated.success) {
          report = validated.data;
        } else {
          streamError = 'Backend returned a malformed report payload.';
        }
      } else if (eventType === 'error') {
        const errorObj = parsed as { error?: string };
        streamError = typeof errorObj?.error === 'string' ? errorObj.error : 'Unknown backend error.';
      }
    }

    if (done) {
      break;
    }
  }

  if (streamError) {
    throw new Error(streamError);
  }

  if (!report) {
    throw new Error('Backend stream ended without a result.');
  }

  return report;
}

function streamingHeaders(): Record<string, string> {
  return {
    'content-type': 'application/json',
    'accept': 'text/event-stream'
  };
}

export async function analyzeExtensionByUrl(url: string, onProgress?: ProgressCallback): Promise<AnalysisReport> {
  const useStreaming = !!onProgress;
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/analyze`, {
      method: 'POST',
      headers: useStreaming ? streamingHeaders() : { 'content-type': 'application/json' },
      body: JSON.stringify({ source: { type: 'url', value: url } }),
      signal: AbortSignal.timeout(ANALYZE_TIMEOUT_MS)
    });
  } catch (error) {
    mapFetchError(error);
  }

  if (useStreaming && response.ok && response.headers.get('content-type')?.includes('text/event-stream')) {
    try {
      return await readSSEStream(response, onProgress);
    } catch (streamError) {
      if (streamError instanceof Error && streamError.message === 'Backend stream ended without a result.') {
        // Stream closed without sending a result or error event (e.g. Worker killed mid-flight).
        // Retry without streaming to get a concrete HTTP response or error.
        return analyzeExtensionByUrl(url);
      }
      throw streamError;
    }
  }

  return parseReportResponse(response);
}

export async function analyzeExtensionById(id: string, onProgress?: ProgressCallback): Promise<AnalysisReport> {
  const useStreaming = !!onProgress;
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/analyze`, {
      method: 'POST',
      headers: useStreaming ? streamingHeaders() : { 'content-type': 'application/json' },
      body: JSON.stringify({ source: { type: 'id', value: id } }),
      signal: AbortSignal.timeout(ANALYZE_TIMEOUT_MS)
    });
  } catch (error) {
    mapFetchError(error);
  }

  if (useStreaming && response.ok && response.headers.get('content-type')?.includes('text/event-stream')) {
    try {
      return await readSSEStream(response, onProgress);
    } catch (streamError) {
      if (streamError instanceof Error && streamError.message === 'Backend stream ended without a result.') {
        return analyzeExtensionById(id);
      }
      throw streamError;
    }
  }

  return parseReportResponse(response);
}

export async function analyzeExtensionByUpload(file: File, onProgress?: ProgressCallback): Promise<AnalysisReport> {
  const useStreaming = !!onProgress;
  const formData = new FormData();
  formData.set('file', file);

  const headers: Record<string, string> = {};
  if (useStreaming) {
    headers['accept'] = 'text/event-stream';
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/analyze/upload`, {
      method: 'POST',
      headers,
      body: formData,
      signal: AbortSignal.timeout(ANALYZE_TIMEOUT_MS)
    });
  } catch (error) {
    mapFetchError(error);
  }

  if (useStreaming && response.ok && response.headers.get('content-type')?.includes('text/event-stream')) {
    try {
      return await readSSEStream(response, onProgress);
    } catch (streamError) {
      if (streamError instanceof Error && streamError.message === 'Backend stream ended without a result.') {
        return analyzeExtensionByUpload(file);
      }
      throw streamError;
    }
  }

  return parseReportResponse(response);
}
