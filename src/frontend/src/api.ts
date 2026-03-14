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

async function parseReportResponse(response: Response): Promise<AnalysisReport> {
  const rawBody = await response.text();
  let body: unknown = null;

  if (rawBody.length > 0) {
    try {
      body = JSON.parse(rawBody) as unknown;
    } catch {
      if (!response.ok) {
        const hint = response.status >= 500
          ? ' The extension package may be too large or complex. Try the Upload tab with the file directly.'
          : '';
        throw new Error(`Analysis failed (server error ${response.status}).${hint}`);
      }

      throw new Error('Backend returned invalid JSON.');
    }
  }

  if (!response.ok) {
    const error = typeof body === 'object'
      && body !== null
      && 'error' in body
      && typeof body.error === 'string'
      ? body.error
      : `Backend request failed with status ${response.status}.`;
    throw new Error(error);
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
