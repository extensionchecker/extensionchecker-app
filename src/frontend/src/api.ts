import { AnalysisReportSchema, AnalysisProgressEventSchema, type AnalysisReport, type AnalysisProgressEvent } from '@extensionchecker/shared';

export type { AnalysisProgressEvent };

export type ProgressCallback = (event: AnalysisProgressEvent) => void;

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

async function parseReportResponse(response: Response): Promise<AnalysisReport> {
  const rawBody = await response.text();
  let body: unknown = null;

  if (rawBody.length > 0) {
    try {
      body = JSON.parse(rawBody) as unknown;
    } catch {
      if (!response.ok) {
        throw new Error(`Backend returned ${response.status} with a non-JSON response body.`);
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
  const response = await fetch(`${API_BASE_URL}/api/analyze`, {
    method: 'POST',
    headers: useStreaming ? streamingHeaders() : { 'content-type': 'application/json' },
    body: JSON.stringify({
      source: {
        type: 'url',
        value: url
      }
    })
  });

  if (useStreaming && response.ok && response.headers.get('content-type')?.includes('text/event-stream')) {
    return readSSEStream(response, onProgress);
  }

  return parseReportResponse(response);
}

export async function analyzeExtensionById(id: string, onProgress?: ProgressCallback): Promise<AnalysisReport> {
  const useStreaming = !!onProgress;
  const response = await fetch(`${API_BASE_URL}/api/analyze`, {
    method: 'POST',
    headers: useStreaming ? streamingHeaders() : { 'content-type': 'application/json' },
    body: JSON.stringify({
      source: {
        type: 'id',
        value: id
      }
    })
  });

  if (useStreaming && response.ok && response.headers.get('content-type')?.includes('text/event-stream')) {
    return readSSEStream(response, onProgress);
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

  const response = await fetch(`${API_BASE_URL}/api/analyze/upload`, {
    method: 'POST',
    headers,
    body: formData
  });

  if (useStreaming && response.ok && response.headers.get('content-type')?.includes('text/event-stream')) {
    return readSSEStream(response, onProgress);
  }

  return parseReportResponse(response);
}
