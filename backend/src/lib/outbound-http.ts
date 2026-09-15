import { HttpError } from './http-error';

interface OutboundRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  retryStatusCodes?: number[];
}

interface OutboundRequestResult {
  response: Response;
  rawText: string;
}

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 300;
const DEFAULT_RETRY_STATUS_CODES = [429, 500, 502, 503, 504];

function wait(delayMs: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function shouldRetryStatus(status: number, retryStatusCodes: number[]) {
  return retryStatusCodes.includes(status) || status >= 500;
}

function getErrorMessage(error: unknown, fallbackMessage: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallbackMessage;
}

export async function requestWithResilience(options: OutboundRequestOptions): Promise<OutboundRequestResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const retryStatusCodes = options.retryStatusCodes ?? DEFAULT_RETRY_STATUS_CODES;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetch(options.url, {
        method: options.method,
        headers: options.headers,
        body: options.body,
        signal: controller.signal
      });

      clearTimeout(timeout);

      const rawText = await response.text();

      if (!response.ok && shouldRetryStatus(response.status, retryStatusCodes) && attempt < maxRetries) {
        await wait(retryDelayMs * (attempt + 1));
        continue;
      }

      return {
        response,
        rawText
      };
    } catch (error) {
      clearTimeout(timeout);

      const isAbort = error instanceof Error && error.name === 'AbortError';

      if (attempt < maxRetries) {
        await wait(retryDelayMs * (attempt + 1));
        continue;
      }

      if (isAbort) {
        throw new HttpError(504, `Upstream request timed out after ${timeoutMs}ms.`);
      }

      throw new HttpError(502, getErrorMessage(error, 'Upstream request failed.'));
    }
  }

  throw new HttpError(502, 'Upstream request failed after retries.');
}
