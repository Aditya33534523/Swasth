import type { LLMMessage } from '../types';

/**
 * Default base URL for the LLM server.
 *
 * This is a RELATIVE path ('/llm-api'), not an absolute 'http://localhost:8080'.
 * Vite's dev server proxies '/llm-api' -> 'http://localhost:8080' (see
 * vite.config.ts), forwarding the request server-side from the machine
 * running llama-server.
 *
 * Why this matters: if you hardcode 'http://localhost:8080' here, it only
 * works when the browser and llama-server are on the same machine. Open
 * the app through a Cloudflare tunnel (trycloudflare.com) from your phone
 * or another computer, and "localhost" in THAT browser means the phone's
 * own port 8080 — never your machine's — so every request fails.
 *
 * Using a relative path fixes this because the browser always calls
 * whatever origin it loaded the page from (localhost:5173 OR the tunnel
 * URL), and in both cases Vite's proxy is the one making the real
 * localhost:8080 request, from the correct machine.
 *
 * Swappable: to point at a different/remote OpenAI-compatible server
 * instead of proxying, set an absolute URL here (or pass baseUrl in
 * LLMConfig) — e.g. 'http://localhost:11434' for Ollama. Just note an
 * absolute localhost URL will break again over a tunnel for the same
 * reason described above; prefer updating the proxy target in
 * vite.config.ts if the LLM server itself moves.
 */
const DEFAULT_BASE_URL = '/llm-api';

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onComplete: (fullText: string) => void;
  onError: (error: Error) => void;
}

export interface LLMConfig {
  baseUrl?: string;
  model?: string;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  maxTokens?: number;
  /** Abort if no response headers arrive within this long (ms). Default 15s. */
  connectTimeoutMs?: number;
  /** Abort if no new token arrives within this long once streaming starts (ms).
   *  Resets on every token, so long-but-actively-streaming replies are fine —
   *  this only catches a server that has genuinely stopped responding
   *  mid-stream, which previously left the UI stuck "generating" forever
   *  with no way out but the manual stop button. Default 30s. */
  stallTimeoutMs?: number;
}

/**
 * Stream a chat completion from the local llama-server.
 * Uses the OpenAI-compatible /v1/chat/completions endpoint.
 *
 * Swappable: change DEFAULT_BASE_URL or pass baseUrl to point at any
 * OpenAI-compatible server (Ollama, vLLM, TGI, etc.)
 */
export async function streamChat(
  messages: LLMMessage[],
  callbacks: StreamCallbacks,
  config: LLMConfig = {},
  signal?: AbortSignal,
): Promise<void> {
  const {
    baseUrl = DEFAULT_BASE_URL,
    model = 'gemma',
    temperature = 1.0,
    top_p = 0.95,
    top_k = 64,
    maxTokens = 4096,
    connectTimeoutMs = 15000,
    stallTimeoutMs = 30000,
  } = config;

  const url = `${baseUrl}/v1/chat/completions`;

  // Combine the caller's abort signal (used for the manual "stop" button)
  // with our own timeout-driven aborts, without requiring AbortSignal.any
  // (not yet available in every Android WebView).
  const internalController = new AbortController();
  let timedOut = false;
  const onUserAbort = () => internalController.abort();
  signal?.addEventListener('abort', onUserAbort);

  let watchdog: ReturnType<typeof setTimeout> | null = setTimeout(() => {
    timedOut = true;
    internalController.abort();
  }, connectTimeoutMs);

  const resetWatchdog = (ms: number) => {
    if (watchdog) clearTimeout(watchdog);
    watchdog = setTimeout(() => {
      timedOut = true;
      internalController.abort();
    }, ms);
  };

  const cleanup = () => {
    if (watchdog) clearTimeout(watchdog);
    signal?.removeEventListener('abort', onUserAbort);
  };

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        temperature,
        top_p,
        top_k,
        max_tokens: maxTokens,
      }),
      signal: internalController.signal,
    });
  } catch (err: unknown) {
    cleanup();
    if ((err as Error).name === 'AbortError') {
      if (timedOut) {
        callbacks.onError(
          new Error(
            `Timed out waiting for LLM server at ${baseUrl}. It may be overloaded or stuck — check the llama-server terminal.`,
          ),
        );
      } else {
        callbacks.onComplete('');
      }
      return;
    }
    callbacks.onError(
      new Error(
        `Cannot connect to LLM server at ${baseUrl}. Make sure llama-server is running.`,
      ),
    );
    return;
  }

  // Connected — switch the watchdog to the (usually shorter) stall timeout.
  resetWatchdog(stallTimeoutMs);

  if (!response.ok) {
    cleanup();
    const body = await response.text().catch(() => '');
    callbacks.onError(
      new Error(`LLM server error ${response.status}: ${body.slice(0, 200)}`),
    );
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    cleanup();
    callbacks.onError(new Error('No response body from LLM server.'));
    return;
  }

  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Any chunk (even a keep-alive) proves the connection is alive —
      // push the stall deadline back out.
      resetWatchdog(stallTimeoutMs);

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const token = parsed.choices?.[0]?.delta?.content || '';
          if (token) {
            fullText += token;
            callbacks.onToken(token);
          }
        } catch {
          // Skip malformed JSON chunks
        }
      }
    }
  } catch (err: unknown) {
    if ((err as Error).name === 'AbortError') {
      if (timedOut) {
        cleanup();
        callbacks.onError(
          new Error(
            `LLM server at ${baseUrl} stopped responding mid-reply (no data for ${Math.round(stallTimeoutMs / 1000)}s).`,
          ),
        );
        return;
      }
      // else: user cancelled — keep what we have, no error to show
    } else {
      cleanup();
      callbacks.onError(err instanceof Error ? err : new Error(String(err)));
      return;
    }
  }

  cleanup();
  callbacks.onComplete(fullText);
}

/** Non-streaming variant for simple checks */
export async function chatCompletion(
  messages: LLMMessage[],
  config: LLMConfig = {},
): Promise<string> {
  const {
    baseUrl = DEFAULT_BASE_URL,
    model = 'gemma',
    temperature = 1.0,
    top_p = 0.95,
    top_k = 64,
    maxTokens = 4096,
  } = config;

  const url = `${baseUrl}/v1/chat/completions`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      temperature,
      top_p,
      top_k,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    throw new Error(`LLM server error ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

/** Check if the LLM server is reachable */
export async function checkLLMHealth(baseUrl = DEFAULT_BASE_URL): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}