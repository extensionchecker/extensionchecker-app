import { AnalysisReportSchema, type AnalysisReport } from '@extensionchecker/shared';

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

export async function analyzeExtensionByUrl(url: string): Promise<AnalysisReport> {
  const response = await fetch(`${API_BASE_URL}/api/analyze`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      source: {
        type: 'url',
        value: url
      }
    })
  });

  return parseReportResponse(response);
}

export async function analyzeExtensionById(id: string): Promise<AnalysisReport> {
  const response = await fetch(`${API_BASE_URL}/api/analyze`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      source: {
        type: 'id',
        value: id
      }
    })
  });

  return parseReportResponse(response);
}

export async function analyzeExtensionByUpload(file: File): Promise<AnalysisReport> {
  const formData = new FormData();
  formData.set('file', file);

  const response = await fetch(`${API_BASE_URL}/api/analyze/upload`, {
    method: 'POST',
    body: formData
  });

  return parseReportResponse(response);
}
