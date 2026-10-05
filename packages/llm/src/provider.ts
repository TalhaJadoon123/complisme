/**
 * LLM providers — bring your own key.
 *
 * Three transports are implemented directly on `fetch`: OpenAI (and any
 * OpenAI-compatible endpoint such as Together, Groq, vLLM, LM Studio),
 * Anthropic Messages, and Ollama. No SDK is used, which keeps the dependency
 * surface small and makes OpenAI-compatible self-hosting a config change.
 *
 * Design rules:
 *  - Fully optional. With no key configured, the caller gets a clear error and
 *    the product degrades to deterministic rules (which is the default path).
 *  - Nothing leaves the machine unless a key is configured.
 *  - Company data is minimised and pseudonymised before it is sent (see redact.ts).
 */

import { extractJsonBlock, safeJsonParse } from '@complisme/shared';

export type ProviderName = 'openai' | 'anthropic' | 'ollama';

export interface LlmConfig {
  provider: ProviderName;
  apiKey?: string;
  baseUrl?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  /** Extra headers (Azure OpenAI needs api-key + api-version). */
  headers?: Record<string, string>;
}

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmRequest {
  messages: LlmMessage[];
  /** Ask the model for JSON. Providers without native JSON mode get it in the prompt. */
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
  /** Model to use instead of the configured default. */
  model?: string;
  /** Response format override (OpenAI). */
  responseFormat?: 'json_object' | 'text';
  signal?: AbortSignal;
}

export interface LlmUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface LlmResponse {
  text: string;
  model: string;
  provider: ProviderName;
  usage: LlmUsage;
  latencyMs: number;
  raw?: unknown;
}

export class LlmNotConfiguredError extends Error {
  constructor(message = 'No LLM provider configured. Set OPENAI_API_KEY, ANTHROPIC_API_KEY or OLLAMA_BASE_URL to enable AI features.') {
    super(message);
    this.name = 'LlmNotConfiguredError';
  }
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly provider?: ProviderName,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

export interface Provider {
  readonly name: ProviderName;
  readonly model: string;
  isConfigured(): boolean;
  complete(request: LlmRequest): Promise<LlmResponse>;
  completeJson<T>(request: LlmRequest, schema: { parse: (v: unknown) => T }): Promise<{ value: T; response: LlmResponse }>;
}

// ---------------------------------------------------------------------------
// Shared request plumbing
// ---------------------------------------------------------------------------

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<{ json: unknown; latencyMs: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });

  const started = Date.now();
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
    if (!response.ok) {
      const message =
        (json as { error?: { message?: string } })?.error?.message ??
        (json as { message?: string })?.message ??
        `HTTP ${response.status}`;
      throw new LlmError(`${response.status} ${message}`, response.status, undefined, json);
    }
    return { json, latencyMs: Date.now() - started };
  } catch (error) {
    if (error instanceof LlmError) throw error;
    if ((error as Error).name === 'AbortError') {
      throw new LlmError(`request timed out after ${timeoutMs}ms`);
    }
    throw new LlmError((error as Error).message);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

// ---------------------------------------------------------------------------
// OpenAI (and OpenAI-compatible endpoints)
// ---------------------------------------------------------------------------

export class OpenAIProvider implements Provider {
  readonly name = 'openai' as const;

  constructor(private readonly config: LlmConfig) {}

  get model(): string {
    return this.config.model;
  }

  isConfigured(): boolean {
    return !!this.config.apiKey || !!this.config.baseUrl;
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    if (!this.isConfigured()) throw new LlmNotConfiguredError('OpenAI provider has no API key or base URL.');
    const base = (this.config.baseUrl ?? 'https://api.openai.com/v1').replace(/\/+$/, '');
    const alreadyEndpoint = base.endsWith('/chat/completions') || base.endsWith('/responses');
    const url = alreadyEndpoint ? base : `${base}/chat/completions`;

    const wantsJson = request.json ?? false;
    const payload: Record<string, unknown> = {
      model: request.model ?? this.config.model,
      messages: request.messages,
      temperature: request.temperature ?? this.config.temperature ?? 0.2,
      max_tokens: request.maxTokens ?? this.config.maxTokens ?? 4000,
    };
    if (wantsJson) {
      payload.response_format =
        (request.responseFormat ?? 'json_object') === 'json_object'
          ? { type: 'json_object' }
          : undefined;
      if (payload.response_format === undefined) delete payload.response_format;
    }

    const headers: Record<string, string> = {
      authorization: `Bearer ${this.config.apiKey ?? 'not-needed'}`,
      ...this.config.headers,
    };

    const { json, latencyMs } = await postJson(
      url,
      headers,
      payload,
      this.config.timeoutMs ?? 60_000,
      request.signal,
    );

    const body = json as {
      choices?: Array<{ message?: { content?: string }; text?: string }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      model?: string;
    };
    const text =
      body.choices?.[0]?.message?.content ??
      body.choices?.[0]?.text ??
      (json as { output_text?: string })?.output_text ??
      '';

    return {
      text,
      model: body.model ?? payload.model as string,
      provider: this.name,
      usage: {
        inputTokens: body.usage?.prompt_tokens,
        outputTokens: body.usage?.completion_tokens,
        totalTokens: body.usage?.total_tokens,
      },
      latencyMs,
      raw: json,
    };
  }

  async completeJson<T>(
    request: LlmRequest,
    schema: { parse: (v: unknown) => T },
  ): Promise<{ value: T; response: LlmResponse }> {
    const response = await this.complete({
      ...request,
      json: true,
      messages: request.messages.map((m) =>
        m.role === 'user' && !m.content.includes('JSON')
          ? { ...m, content: `${m.content}\n\nRespond with a single valid JSON object and nothing else.` }
          : m,
      ),
    });
    return { value: parseJson<T>(response.text, schema), response };
  }
}

// ---------------------------------------------------------------------------
// Anthropic
// ---------------------------------------------------------------------------

export class AnthropicProvider implements Provider {
  readonly name = 'anthropic' as const;

  constructor(private readonly config: LlmConfig) {}

  get model(): string {
    return this.config.model;
  }

  isConfigured(): boolean {
    return !!this.config.apiKey;
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    if (!this.isConfigured()) throw new LlmNotConfiguredError('Anthropic provider has no API key.');
    const base = (this.config.baseUrl ?? 'https://api.anthropic.com').replace(/\/+$/, '');
    const url = base.endsWith('/v1/messages') ? base : `${base}/v1/messages`;

    const system = request.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');
    const messages = request.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content }));

    const payload = {
      model: request.model ?? this.config.model,
      max_tokens: request.maxTokens ?? this.config.maxTokens ?? 4000,
      temperature: request.temperature ?? this.config.temperature ?? 0.2,
      ...(system ? { system } : {}),
      messages,
    };

    const { json, latencyMs } = await postJson(
      url,
      {
        'x-api-key': this.config.apiKey!,
        'anthropic-version': '2023-06-01',
        ...this.config.headers,
      },
      payload,
      this.config.timeoutMs ?? 60_000,
      request.signal,
    );

    const body = json as {
      content?: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
      model?: string;
    };
    const text = (body.content ?? [])
      .filter((c) => c.type === 'text')
      .map((c) => c.text ?? '')
      .join('');

    return {
      text,
      model: body.model ?? (request.model ?? this.config.model),
      provider: this.name,
      usage: {
        inputTokens: body.usage?.input_tokens,
        outputTokens: body.usage?.output_tokens,
        totalTokens: (body.usage?.input_tokens ?? 0) + (body.usage?.output_tokens ?? 0),
      },
      latencyMs,
      raw: json,
    };
  }

  async completeJson<T>(
    request: LlmRequest,
    schema: { parse: (v: unknown) => T },
  ): Promise<{ value: T; response: LlmResponse }> {
    const response = await this.complete({
      ...request,
      json: true,
      messages: request.messages.map((m) =>
        m.role === 'user' && !m.content.includes('JSON')
          ? { ...m, content: `${m.content}\n\nRespond with a single valid JSON object and nothing else.` }
          : m,
      ),
    });
    return { value: parseJson<T>(response.text, schema), response };
  }
}

// ---------------------------------------------------------------------------
// Ollama (local)
// ---------------------------------------------------------------------------

export class OllamaProvider implements Provider {
  readonly name = 'ollama' as const;

  constructor(private readonly config: LlmConfig) {}

  get model(): string {
    return this.config.model;
  }

  isConfigured(): boolean {
    return !!this.config.baseUrl;
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const base = (this.config.baseUrl ?? 'http://localhost:11434').replace(/\/+$/, '');
    const url = `${base}/api/chat`;
    const payload = {
      model: request.model ?? this.config.model,
      messages: request.messages,
      stream: false,
      format: request.json ? 'json' : undefined,
      options: {
        temperature: request.temperature ?? this.config.temperature ?? 0.2,
        num_predict: request.maxTokens ?? this.config.maxTokens ?? 4000,
      },
    };

    const { json, latencyMs } = await postJson(
      url,
      { ...this.config.headers },
      payload,
      this.config.timeoutMs ?? 120_000,
      request.signal,
    );

    const body = json as {
      message?: { content?: string };
      prompt_eval_count?: number;
      eval_count?: number;
      model?: string;
    };

    return {
      text: body.message?.content ?? '',
      model: body.model ?? (request.model ?? this.config.model),
      provider: this.name,
      usage: {
        inputTokens: body.prompt_eval_count,
        outputTokens: body.eval_count,
        totalTokens: (body.prompt_eval_count ?? 0) + (body.eval_count ?? 0),
      },
      latencyMs,
      raw: json,
    };
  }

  async completeJson<T>(
    request: LlmRequest,
    schema: { parse: (v: unknown) => T },
  ): Promise<{ value: T; response: LlmResponse }> {
    const response = await this.complete({ ...request, json: true });
    return { value: parseJson<T>(response.text, schema), response };
  }
}

// ---------------------------------------------------------------------------
// JSON parsing shared by all providers
// ---------------------------------------------------------------------------

export function parseJson<T>(text: string, schema: { parse: (v: unknown) => T }): T {
  const block = extractJsonBlock(text);
  if (!block) {
    throw new LlmError(`model did not return JSON. Raw output: ${text.slice(0, 300)}`);
  }
  const parsed = safeJsonParse<unknown>(block, undefined);
  if (parsed === undefined) {
    throw new LlmError(`model returned malformed JSON. Raw output: ${block.slice(0, 300)}`);
  }
  return schema.parse(parsed);
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface LlmEnv {
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  OPENAI_MODEL?: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_BASE_URL?: string;
  ANTHROPIC_MODEL?: string;
  OLLAMA_BASE_URL?: string;
  OLLAMA_MODEL?: string;
  LLM_PROVIDER?: string;
  timeoutMs?: number;
}

/** Detect the provider from the environment, or return null when none is set. */
export function detectConfig(env: LlmEnv = process.env as LlmEnv): LlmConfig | null {
  const explicit = env.LLM_PROVIDER?.toLowerCase() as ProviderName | undefined;
  if (explicit === 'openai' && (env.OPENAI_API_KEY || env.OPENAI_BASE_URL)) {
    return {
      provider: 'openai',
      apiKey: env.OPENAI_API_KEY,
      baseUrl: env.OPENAI_BASE_URL,
      model: env.OPENAI_MODEL ?? 'gpt-4o-mini',
      timeoutMs: env.timeoutMs,
    };
  }
  if (explicit === 'anthropic' && env.ANTHROPIC_API_KEY) {
    return {
      provider: 'anthropic',
      apiKey: env.ANTHROPIC_API_KEY,
      baseUrl: env.ANTHROPIC_BASE_URL,
      model: env.ANTHROPIC_MODEL ?? 'claude-3-5-sonnet-latest',
      timeoutMs: env.timeoutMs,
    };
  }
  if (explicit === 'ollama') {
    return {
      provider: 'ollama',
      baseUrl: env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
      model: env.OLLAMA_MODEL ?? 'llama3.1',
      timeoutMs: env.timeoutMs,
    };
  }
  if (env.OPENAI_API_KEY || env.OPENAI_BASE_URL) {
    return {
      provider: 'openai',
      apiKey: env.OPENAI_API_KEY,
      baseUrl: env.OPENAI_BASE_URL,
      model: env.OPENAI_MODEL ?? 'gpt-4o-mini',
      timeoutMs: env.timeoutMs,
    };
  }
  if (env.ANTHROPIC_API_KEY) {
    return {
      provider: 'anthropic',
      apiKey: env.ANTHROPIC_API_KEY,
      baseUrl: env.ANTHROPIC_BASE_URL,
      model: env.ANTHROPIC_MODEL ?? 'claude-3-5-sonnet-latest',
      timeoutMs: env.timeoutMs,
    };
  }
  if (env.OLLAMA_BASE_URL) {
    return {
      provider: 'ollama',
      baseUrl: env.OLLAMA_BASE_URL,
      model: env.OLLAMA_MODEL ?? 'llama3.1',
      timeoutMs: env.timeoutMs,
    };
  }
  return null;
}

export function createProvider(config: LlmConfig): Provider {
  switch (config.provider) {
    case 'openai':
      return new OpenAIProvider(config);
    case 'anthropic':
      return new AnthropicProvider(config);
    case 'ollama':
      return new OllamaProvider(config);
    default:
      throw new Error(`unknown LLM provider: ${String(config.provider)}`);
  }
}

/** Build a provider from the environment, or return null when none is configured. */
export function providerFromEnv(env: LlmEnv = process.env as LlmEnv): Provider | null {
  const config = detectConfig(env);
  return config ? createProvider(config) : null;
}

export function isLlmAvailable(env: LlmEnv = process.env as LlmEnv): boolean {
  return detectConfig(env) !== null;
}