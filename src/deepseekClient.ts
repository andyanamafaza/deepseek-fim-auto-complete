import * as https from 'https';
import * as zlib from 'zlib';
import * as vscode from 'vscode';
import { parseSSEStream } from './streamParser';

const MAX_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 10000;

export type ClientLogger = (message: string) => void;

export interface FimRequest {
  prompt: string;
  suffix?: string;
  maxTokens: number;
  temperature: number;
  model: string;
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  stop?: string[];
  topP?: number;
}

export interface FimResponse {
  text: string;
  finishReason: string | null;
  tokensUsed?: number;
}

/** Decode the response body, honouring Content-Encoding if a proxy forces it. */
function decodeBody(response: import('http').IncomingMessage, buf: Buffer): string {
  const encoding = String(response.headers['content-encoding'] || '').toLowerCase();
  try {
    if (encoding.includes('gzip')) return zlib.gunzipSync(buf).toString('utf8');
    if (encoding.includes('deflate')) return zlib.inflateSync(buf).toString('utf8');
    if (encoding.includes('br')) return zlib.brotliDecompressSync(buf).toString('utf8');
  } catch {
    // fall through to raw text
  }
  return buf.toString('utf8');
}

/**
 * Read the full response body. Always settles: resolves on end, rejects on
 * error/abort/close-without-end, so a truncated stream can never hang forever.
 */
function readBody(response: import('http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    response.on('data', (chunk: Buffer) => chunks.push(chunk));
    response.on('end', () => finish(() => resolve(decodeBody(response, Buffer.concat(chunks)))));
    response.on('error', (err) => finish(() => reject(err)));
    response.on('aborted', () => finish(() => reject(new Error('Response aborted before completion'))));
    response.on('close', () => finish(() => reject(new Error('Response closed before completion'))));
  });
}

function extractErrorMessage(raw: string, fallback: string): string {
  try {
    const parsed = JSON.parse(raw);
    const msg = parsed?.error?.message;
    if (typeof msg === 'string' && msg.length > 0) return msg;
  } catch {
    // not JSON
  }
  return fallback || raw.slice(0, 200);
}

export class DeepSeekClient {
  /** The most recent non-cancellation error, for user-facing diagnostics. */
  lastError: string | undefined;

  constructor(private log: ClientLogger = () => {}) {}

  async complete(
    req: FimRequest,
    token: vscode.CancellationToken,
    attempt = 0
  ): Promise<FimResponse | undefined> {
    if (!req.apiKey) return undefined;

    const body = JSON.stringify({
      model: req.model,
      prompt: req.prompt,
      suffix: req.suffix || undefined,
      max_tokens: req.maxTokens,
      temperature: req.temperature,
      top_p: req.topP ?? 0.95,
      stop: req.stop?.length ? req.stop : undefined,
      stream: false,
    });

    try {
      const result = await this.makeRequest(req.apiKey, body, token, req.baseUrl, req.timeoutMs);
      this.lastError = undefined;
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // A superseded/cancelled request (the user typed again) must never retry.
      if (message === 'CANCELLED' || token.isCancellationRequested) return undefined;

      if (attempt < MAX_RETRIES && this.isRetryable(message)) {
        const delay = Math.pow(2, attempt) * 500;
        this.log(`Retrying (${attempt + 1}/${MAX_RETRIES}) after ${delay}ms: ${message}`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        if (token.isCancellationRequested) return undefined;
        return this.complete(req, token, attempt + 1);
      }

      this.lastError = message;
      this.log(`API error: ${message}`);
      return undefined;
    }
  }

  async *streamComplete(
    req: FimRequest,
    token: vscode.CancellationToken
  ): AsyncGenerator<string> {
    if (!req.apiKey) return;

    const body = JSON.stringify({
      model: req.model,
      prompt: req.prompt,
      suffix: req.suffix || undefined,
      max_tokens: req.maxTokens,
      temperature: req.temperature,
      top_p: req.topP ?? 0.95,
      stop: req.stop?.length ? req.stop : undefined,
      stream: true,
    });

    let attempt = 0;
    let hasYielded = false;

    while (attempt <= MAX_RETRIES) {
      if (token.isCancellationRequested) return;

      try {
        const started = await this.makeStreamRequest(req.apiKey, body, token, req.baseUrl, req.timeoutMs);
        if (!started) return;

        for await (const chunk of started.stream) {
          if (token.isCancellationRequested) return;
          hasYielded = true;
          yield chunk;
        }

        if (!token.isCancellationRequested) {
          return;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message === 'CANCELLED' || token.isCancellationRequested) return;

        if (hasYielded) {
          this.log(`Stream interrupted after ${attempt} retries: ${message}`);
          return;
        }

        if (attempt < MAX_RETRIES && this.isRetryable(message)) {
          const delay = Math.pow(2, attempt) * 500;
          this.log(`Stream retry (${attempt + 1}/${MAX_RETRIES}) after ${delay}ms: ${message}`);
          attempt++;
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        this.lastError = message;
        this.log(`Stream error: ${message}`);
        return;
      }
    }
  }

  private isRetryable(message: string): boolean {
    // Match the leading status code (bodies/request IDs must not trigger retries)
    if (/^\s*(429|500|502|503|504)\b/.test(message)) return true;
    return /ETIMEDOUT|ECONNRESET|socket hang up|aborted|closed before completion/i.test(message);
  }

  /**
   * Issue the HTTP request. The returned `cleanup` MUST be called once the
   * response body has been consumed; it clears the hard wall-clock timeout and
   * the cancellation subscription. The timeout covers connection *and* body
   * read, so a slow or stalled response can never hang the caller.
   */
  private request(
    apiKey: string,
    body: string,
    token: vscode.CancellationToken,
    baseUrl?: string,
    timeoutMs?: number,
  ): Promise<{ response: import('http').IncomingMessage; cleanup: () => void }> {
    const url = new URL(`${(baseUrl || 'https://api.deepseek.com/beta').replace(/\/+$/, '')}/completions`);
    const timeout = timeoutMs && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    let tokenSub: vscode.Disposable | undefined;
    let settled = false;
    let cancelled = false;

    const cleanup = () => {
      clearTimeout(timer);
      tokenSub?.dispose();
    };

    this.log(`POST ${url.pathname} (timeout ${timeout}ms)`);

    return new Promise((resolve, reject) => {
      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(err);
      };

      const request = https.request(
        {
          hostname: url.hostname,
          path: url.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            'Content-Length': Buffer.byteLength(body),
            // Ask for an uncompressed body; we decompress as a safety net anyway.
            'Accept-Encoding': 'identity',
          },
          signal: controller.signal,
        },
        (response) => {
          if (settled) {
            response.resume();
            return;
          }
          settled = true;
          resolve({ response, cleanup });
        }
      );

      request.on('error', (err: NodeJS.ErrnoException) => {
        if (err.name === 'AbortError') {
          // Distinguish our own cancellation from the hard timeout.
          fail(new Error(cancelled ? 'CANCELLED' : 'ETIMEDOUT'));
        } else {
          fail(err);
        }
      });

      tokenSub = token.onCancellationRequested(() => {
        cancelled = true;
        controller.abort();
        fail(new Error('CANCELLED'));
      });

      request.write(body);
      request.end();
    });
  }

  private async makeRequest(
    apiKey: string,
    body: string,
    token: vscode.CancellationToken,
    baseUrl?: string,
    timeoutMs?: number,
  ): Promise<FimResponse | undefined> {
    const { response, cleanup } = await this.request(apiKey, body, token, baseUrl, timeoutMs);
    try {
      const statusCode = response.statusCode || 0;
      const data = await readBody(response);

      if (statusCode >= 400) {
        throw new Error(`${statusCode}: ${extractErrorMessage(data, response.statusMessage || '')}`);
      }

      const parsed = JSON.parse(data);
      const text = parsed.choices?.[0]?.text || '';
      const finishReason = parsed.choices?.[0]?.finish_reason || null;
      const tokensUsed = parsed.usage?.total_tokens;
      return { text, finishReason, tokensUsed };
    } catch (err) {
      // Normalize any mid-body abort caused by our own cancellation.
      if (token.isCancellationRequested) throw new Error('CANCELLED');
      throw err;
    } finally {
      cleanup();
    }
  }

  private async makeStreamRequest(
    apiKey: string,
    body: string,
    token: vscode.CancellationToken,
    baseUrl?: string,
    timeoutMs?: number,
  ): Promise<{ stream: AsyncGenerator<string> } | undefined> {
    const { response, cleanup } = await this.request(apiKey, body, token, baseUrl, timeoutMs);
    const statusCode = response.statusCode || 0;

    if (statusCode >= 400) {
      try {
        const data = await readBody(response);
        throw new Error(`${statusCode}: ${extractErrorMessage(data, response.statusMessage || '')}`);
      } finally {
        cleanup();
      }
    }

    return { stream: this.withCleanup(parseSSEStream(response), cleanup) };
  }

  private async *withCleanup(
    stream: AsyncGenerator<string>,
    cleanup: () => void,
  ): AsyncGenerator<string> {
    try {
      yield* stream;
    } finally {
      cleanup();
    }
  }

  async validateApiKey(apiKey: string): Promise<{ valid: boolean; message: string }> {
    return new Promise((resolve) => {
      const url = new URL('https://api.deepseek.com/user/balance');
      let settled = false;
      const done = (result: { valid: boolean; message: string }) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      const request = https.get(
        {
          hostname: url.hostname,
          path: url.pathname,
          timeout: 5000,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Accept-Encoding': 'identity',
          },
        },
        (response) => {
          readBody(response)
            .then((body) => {
              if (response.statusCode === 200) {
                done({ valid: true, message: 'API key is valid' });
              } else if (response.statusCode === 401) {
                done({ valid: false, message: 'Invalid API key (401 Unauthorized)' });
              } else {
                done({ valid: false, message: `Unexpected response: ${response.statusCode} — ${body.slice(0, 200)}` });
              }
            })
            .catch((err) => done({ valid: false, message: `Validation failed: ${err instanceof Error ? err.message : String(err)}` }));
        }
      );

      request.on('timeout', () => {
        request.destroy();
        done({ valid: false, message: 'Validation request timed out. Key may still work.' });
      });

      request.on('error', () => {
        done({ valid: false, message: 'Could not reach DeepSeek API' });
      });
    });
  }
}
