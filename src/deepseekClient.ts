import * as https from 'https';
import * as vscode from 'vscode';
import { parseSSEStream } from './streamParser';
import { safeWarn, safeError } from './safeConsole';

const MAX_RETRIES = 3;

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
}

export class DeepSeekClient {
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
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'CANCELLED') return undefined;

      if (attempt < MAX_RETRIES && this.isRetryable(message)) {
        const delay = Math.pow(2, attempt) * 500;
        safeWarn(`[DeepSeek Autocomplete] Retrying (${attempt + 1}/${MAX_RETRIES}) after ${delay}ms: ${message}`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        if (token.isCancellationRequested) return undefined;
        return this.complete(req, token, attempt + 1);
      }

      safeError(`[DeepSeek Autocomplete] API error: ${message}`);
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

    try {
      const stream = await this.makeStreamRequest(req.apiKey, body, token, req.baseUrl, req.timeoutMs);
      if (!stream) return;

      for await (const chunk of stream) {
        if (token.isCancellationRequested) return;
        yield chunk;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'CANCELLED') return;
      safeError(`[DeepSeek Autocomplete] Stream error: ${message}`);
    }
  }

  private isRetryable(message: string): boolean {
    return message.includes('429') ||
      message.includes('500') ||
      message.includes('502') ||
      message.includes('503') ||
      message.includes('504') ||
      message.includes('ETIMEDOUT') ||
      message.includes('ECONNRESET') ||
      message.includes('socket hang up');
  }

  private makeRequest(
    apiKey: string,
    body: string,
    token: vscode.CancellationToken,
    baseUrl?: string,
    timeoutMs?: number
  ): Promise<FimResponse | undefined> {
    const url = new URL(`${(baseUrl || 'https://api.deepseek.com/beta').replace(/\/+$/, '')}/completions`);
    const timeout = timeoutMs || 10000;

    return new Promise((resolve, reject) => {
      const request = https.request(
        {
          hostname: url.hostname,
          path: url.pathname,
          method: 'POST',
          timeout,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            'Content-Length': Buffer.byteLength(body),
          },
        },
        (response) => {
          let data = '';
          response.on('data', (chunk: Buffer) => {
            data += chunk.toString();
          });
          response.on('end', () => {
            const statusCode = response.statusCode || 0;

            if (statusCode >= 400) {
              reject(new Error(`${statusCode}: ${data.slice(0, 200)}`));
              return;
            }

            try {
              const parsed = JSON.parse(data);
              const text = parsed.choices?.[0]?.text || '';
              const finishReason = parsed.choices?.[0]?.finish_reason || null;
              resolve({ text, finishReason });
            } catch {
              resolve(undefined);
            }
          });
        }
      );

      request.on('timeout', () => {
        request.destroy();
        reject(new Error('ETIMEDOUT'));
      });

      request.on('error', (err) => reject(err));
      request.write(body);
      request.end();

      token.onCancellationRequested(() => {
        request.destroy();
        reject(new Error('CANCELLED'));
      });
    });
  }

  private makeStreamRequest(
    apiKey: string,
    body: string,
    token: vscode.CancellationToken,
    baseUrl?: string,
    timeoutMs?: number
  ): Promise<AsyncGenerator<string> | undefined> {
    const url = new URL(`${(baseUrl || 'https://api.deepseek.com/beta').replace(/\/+$/, '')}/completions`);
    const timeout = timeoutMs || 10000;

    return new Promise((resolve, reject) => {
      const request = https.request(
        {
          hostname: url.hostname,
          path: url.pathname,
          method: 'POST',
          timeout,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            'Content-Length': Buffer.byteLength(body),
          },
        },
        (response) => {
          const statusCode = response.statusCode || 0;
          if (statusCode >= 400) {
            let _data = '';
            response.on('data', (chunk: Buffer) => { _data += chunk.toString(); });
            response.on('end', () => reject(new Error(`${statusCode}: ${_data.slice(0, 200)}`)));
            return;
          }
          resolve(parseSSEStream(response));
        }
      );

      request.on('timeout', () => {
        request.destroy();
        reject(new Error('ETIMEDOUT'));
      });

      request.on('error', (err) => reject(err));
      request.write(body);
      request.end();

      token.onCancellationRequested(() => {
        request.destroy();
        reject(new Error('CANCELLED'));
      });
    });
  }

  async validateApiKey(apiKey: string): Promise<{ valid: boolean; message: string }> {
    return new Promise((resolve) => {
      const url = new URL('https://api.deepseek.com/user/balance');

      const request = https.get(
        {
          hostname: url.hostname,
          path: url.pathname,
          timeout: 5000,
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        },
        (response) => {
          response.on('end', () => {
            if (response.statusCode === 200) {
              resolve({ valid: true, message: 'API key is valid' });
            } else if (response.statusCode === 401) {
              resolve({ valid: false, message: 'Invalid API key (401 Unauthorized)' });
            } else {
              resolve({ valid: false, message: `Unexpected response: ${response.statusCode}` });
            }
          });
        }
      );

      request.on('error', () => resolve({ valid: false, message: 'Could not reach DeepSeek API' }));
      request.end();
    });
  }
}
