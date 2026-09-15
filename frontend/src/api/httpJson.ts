interface ParseBodyResult {
  payload: unknown;
  hasBody: boolean;
}

async function parseBody(response: Response): Promise<ParseBodyResult> {
  const rawText = await response.text();

  if (!rawText.trim()) {
    return {
      payload: null,
      hasBody: false
    };
  }

  try {
    return {
      payload: JSON.parse(rawText) as unknown,
      hasBody: true
    };
  } catch {
    return {
      payload: rawText,
      hasBody: true
    };
  }
}

function extractErrorMessage(payload: unknown, fallback: string) {
  if (typeof payload === 'string' && payload.trim()) {
    return payload;
  }

  if (!payload || typeof payload !== 'object') {
    return fallback;
  }

  const objectPayload = payload as {
    error?: unknown;
    message?: unknown;
  };

  if (typeof objectPayload.error === 'string' && objectPayload.error.trim()) {
    return objectPayload.error;
  }

  if (typeof objectPayload.message === 'string' && objectPayload.message.trim()) {
    return objectPayload.message;
  }

  return fallback;
}

export async function httpJson<T>(
  url: string,
  init: RequestInit | undefined,
  options?: {
    fallbackError?: string;
    requireBody?: boolean;
  }
): Promise<T> {
  const fallbackError = options?.fallbackError || 'Request failed';
  const requireBody = options?.requireBody ?? true;

  const response = await fetch(url, init);
  const { payload, hasBody } = await parseBody(response);

  if (!response.ok) {
    throw new Error(extractErrorMessage(payload, fallbackError));
  }

  if (requireBody && !hasBody) {
    throw new Error('Server returned an empty response body');
  }

  return payload as T;
}
