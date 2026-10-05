import { describe, expect, it } from 'vitest';

import { llmDraftSchema, llmGapAnalysisSchema } from '@complisme/shared';

import {
  AnthropicProvider,
  LlmClient,
  LlmNotConfiguredError,
  OllamaProvider,
  OpenAIProvider,
  buildDocumentPrompt,
  buildGapAnalysisPrompt,
  createProvider,
  detectConfig,
  isLlmAvailable,
  parseJson,
  pseudonymise,
  redact,
  truncate,
} from '../src/index';
import { acme } from '@complisme/core';
import { getFramework } from '@complisme/frameworks';

/** Capture requests and reply with a canned body. */
function mockFetch(handler: (url: string, body: unknown) => unknown) {
  const calls: Array<{ url: string; body: unknown }> = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, body });
    const payload = handler(url, body);
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify(payload);
      },
    } as Response;
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

describe('redaction', () => {
  it('replaces direct identifiers', () => {
    const result = redact('Contact ada@example.com or +31 6 1234 5678, IP 192.168.1.10, card 4111 1111 1111 1111');
    expect(result.text).not.toContain('ada@example.com');
    expect(result.text).toContain('[email]');
    expect(result.text).toContain('[phone]');
    expect(result.text).toContain('[ip]');
    expect(result.text).toContain('[card]');
    expect(result.categories).toContain('email');
    expect(result.count).toBeGreaterThan(3);
  });

  it('pseudonymises the company name deterministically', () => {
    expect(pseudonymise('Acme BV')).toBe(pseudonymise('Acme BV'));
    expect(pseudonymise('Acme BV')).not.toContain('Acme');
    expect(pseudonymise(undefined)).toBe('the company');
  });

  it('truncates with a notice', () => {
    const out = truncate('x'.repeat(200), 50);
    expect(out.length).toBeLessThan(150);
    expect(out).toContain('truncated');
  });
});

describe('prompts', () => {
  const framework = getFramework('gdpr');

  it('builds a gap-analysis prompt containing the framework and answers', () => {
    const prompt = buildGapAnalysisPrompt({ profile: acme, framework, answers: {} });
    expect(prompt).toContain('GDPR');
    expect(prompt).toContain('Article 30 — Records of processing activities (ROPA)');
    expect(prompt).toContain('Data protection impact assessment');
    // The real company name is pseudonymised before it leaves the machine.
    expect(prompt).not.toContain('Acme Analytics BV');
    expect(prompt).toContain('Company ');
  });

  it('lists existing gaps so the model does not repeat them', () => {
    const prompt = buildGapAnalysisPrompt({
      profile: acme,
      framework,
      answers: {},
      existingGapKeys: ['art-30-ropa: ROPA missing'],
    });
    expect(prompt).toContain('do not repeat');
    expect(prompt).toContain('art-30-ropa: ROPA missing');
  });

  it('builds a document prompt with section instructions', () => {
    const prompt = buildDocumentPrompt({ kind: 'gdpr-dpia', profile: acme });
    expect(prompt).toContain('gdpr dpia');
    expect(prompt).toContain('Systematic description');
  });
});

describe('JSON parsing', () => {
  it('parses plain JSON', () => {
    const value = parseJson('{"a":1}', llmDraftSchema);
    expect(value.sections).toEqual([]);
  });

  it('parses JSON wrapped in a code fence', () => {
    const value = parseJson('Sure!\n```json\n{"sections":[{"heading":"x","body":"y"}]}\n```', llmDraftSchema);
    expect(value.sections).toHaveLength(1);
  });

  it('parses JSON embedded in prose', () => {
    const value = parseJson('Here you go: {"sections":[]} done', llmDraftSchema);
    expect(value.sections).toEqual([]);
  });

  it('throws on non-JSON', () => {
    expect(() => parseJson('no json here', llmDraftSchema)).toThrow();
  });
});

describe('provider configuration', () => {
  it('detects OpenAI', () => {
    const config = detectConfig({ OPENAI_API_KEY: 'sk-test' });
    expect(config?.provider).toBe('openai');
    expect(config?.model).toBe('gpt-4o-mini');
    expect(isLlmAvailable({ OPENAI_API_KEY: 'sk-test' })).toBe(true);
  });

  it('detects Anthropic', () => {
    const config = detectConfig({ ANTHROPIC_API_KEY: 'sk-ant' });
    expect(config?.provider).toBe('anthropic');
  });

  it('detects Ollama last, so a local model does not shadow a cloud key', () => {
    const config = detectConfig({ OPENAI_API_KEY: 'sk-test', OLLAMA_BASE_URL: 'http://localhost:11434' });
    expect(config?.provider).toBe('openai');
  });

  it('respects an explicit provider', () => {
    const config = detectConfig({ LLM_PROVIDER: 'ollama', OPENAI_API_KEY: 'sk-test' });
    expect(config?.provider).toBe('ollama');
  });

  it('returns null when nothing is configured', () => {
    expect(detectConfig({})).toBeNull();
    expect(isLlmAvailable({})).toBe(false);
  });

  it('builds provider instances', () => {
    expect(createProvider({ provider: 'openai', apiKey: 'k', model: 'm' })).toBeInstanceOf(OpenAIProvider);
    expect(createProvider({ provider: 'anthropic', apiKey: 'k', model: 'm' })).toBeInstanceOf(AnthropicProvider);
    expect(createProvider({ provider: 'ollama', baseUrl: 'http://x', model: 'm' })).toBeInstanceOf(OllamaProvider);
  });
});

describe('OpenAIProvider', () => {
  it('calls the chat completions endpoint and parses the response', async () => {
    const mock = mockFetch(() => ({
      model: 'gpt-4o-mini',
      choices: [{ message: { content: 'hello' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }));
    try {
      const provider = new OpenAIProvider({ provider: 'openai', apiKey: 'sk-test', model: 'gpt-4o-mini' });
      const response = await provider.complete({ messages: [{ role: 'user', content: 'hi' }] });
      expect(response.text).toBe('hello');
      expect(response.usage.totalTokens).toBe(15);
      expect(mock.calls[0].url).toBe('https://api.openai.com/v1/chat/completions');
    } finally {
      mock.restore();
    }
  });

  it('sets the JSON response format when asked', async () => {
    const mock = mockFetch(() => ({ choices: [{ message: { content: '{"gaps":[]}' } }] }));
    try {
      const provider = new OpenAIProvider({ provider: 'openai', apiKey: 'sk-test', model: 'm' });
      await provider.completeJson(
        { messages: [{ role: 'user', content: 'give gaps' }], json: true },
        llmGapAnalysisSchema,
      );
      const body = mock.calls[0].body as { response_format?: { type: string } };
      expect(body.response_format).toEqual({ type: 'json_object' });
    } finally {
      mock.restore();
    }
  });

  it('throws when not configured', async () => {
    const provider = new OpenAIProvider({ provider: 'openai', model: 'm' });
    await expect(provider.complete({ messages: [] })).rejects.toThrow(LlmNotConfiguredError);
  });
});

describe('AnthropicProvider', () => {
  it('splits the system prompt and posts to /v1/messages', async () => {
    const mock = mockFetch(() => ({
      content: [{ type: 'text', text: 'from claude' }],
      usage: { input_tokens: 3, output_tokens: 4 },
    }));
    try {
      const provider = new AnthropicProvider({ provider: 'anthropic', apiKey: 'sk-ant', model: 'claude' });
      const response = await provider.complete({
        messages: [
          { role: 'system', content: 'be precise' },
          { role: 'user', content: 'hello' },
        ],
      });
      expect(response.text).toBe('from claude');
      expect(mock.calls[0].url).toContain('/v1/messages');
      const body = mock.calls[0].body as { system: string; messages: unknown[] };
      expect(body.system).toBe('be precise');
      expect(body.messages).toHaveLength(1);
    } finally {
      mock.restore();
    }
  });
});

describe('OllamaProvider', () => {
  it('posts to the local chat endpoint with JSON format', async () => {
    const mock = mockFetch(() => ({ message: { content: '{"sections":[]}' }, model: 'llama3.1' }));
    try {
      const provider = new OllamaProvider({ provider: 'ollama', baseUrl: 'http://localhost:11434', model: 'llama3.1' });
      const response = await provider.completeJson(
        { messages: [{ role: 'user', content: 'draft' }], json: true },
        llmDraftSchema,
      );
      expect(response.value.sections).toEqual([]);
      const body = mock.calls[0].body as { format: string };
      expect(body.format).toBe('json');
    } finally {
      mock.restore();
    }
  });
});

describe('LlmClient', () => {
  const framework = getFramework('gdpr');

  it('degrades gracefully when no provider is configured', async () => {
    const client = new LlmClient(new OpenAIProvider({ provider: 'openai', model: 'm' }));
    expect(client.isAvailable).toBe(false);
    const run = await client.analyseGaps({ profile: acme, framework, answers: {} });
    expect(run.used).toBe(false);
    expect(run.gaps).toEqual([]);
    expect(run.warning).toBeTruthy();

    const draft = await client.draftDocument({ kind: 'gdpr-dpia', profile: acme });
    expect(draft.used).toBe(false);
    expect(draft.narrative).toEqual({});
  });

  it('converts model gaps into engine gaps', async () => {
    const mock = mockFetch(() => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              summary: 'Main risk is missing transfer documentation.',
              gaps: [
                {
                  articleId: 'art-44-49-transfers',
                  title: 'No transfer impact assessment for US sub-processors',
                  severity: 'error',
                  remediation: 'Complete a TIA for each US sub-processor and attach the supplementary measures.',
                  effort: 6,
                  fineExposure: 15000000,
                  confidence: 0.8,
                },
                {
                  articleId: 'does-not-exist',
                  title: 'hallucinated article',
                  severity: 'info',
                  remediation: 'n/a',
                  effort: 1,
                },
              ],
            }),
          },
        },
      ],
    }));
    try {
      const client = new LlmClient(
        new OpenAIProvider({ provider: 'openai', apiKey: 'sk-test', model: 'gpt-4o-mini' }),
      );
      const run = await client.analyseGaps({ profile: acme, framework, answers: {} });
      expect(run.used).toBe(true);
      expect(run.gaps).toHaveLength(1);
      expect(run.gaps[0].source).toBe('llm');
      expect(run.gaps[0].severity).toBe('error');
      expect(run.gaps[0].id).toContain('llm');
      expect(run.gaps[0].effort).toBe(6);
    } finally {
      mock.restore();
    }
  });

  it('reports a warning instead of throwing when the model output is unusable', async () => {
    const mock = mockFetch(() => ({ choices: [{ message: { content: 'I cannot help with that.' } }] }));
    try {
      const client = new LlmClient(new OpenAIProvider({ provider: 'openai', apiKey: 'sk-test', model: 'm' }));
      const run = await client.analyseGaps({ profile: acme, framework, answers: {} });
      expect(run.used).toBe(false);
      expect(run.gaps).toEqual([]);
      expect(run.warning).toContain('did not return JSON');
    } finally {
      mock.restore();
    }
  });

  it('keys drafted sections onto the template section ids', async () => {
    const mock = mockFetch(() => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              sections: [
                { heading: 'Systematic description', body: 'The processing covers...' },
                { heading: 'Risks', body: 'The main risk is...' },
              ],
            }),
          },
        },
      ],
    }));
    try {
      const client = new LlmClient(new OpenAIProvider({ provider: 'openai', apiKey: 'sk-test', model: 'm' }));
      const run = await client.draftDocument({ kind: 'gdpr-dpia', profile: acme });
      expect(run.used).toBe(true);
      expect(run.narrative['description']).toContain('processing covers');
      expect(run.narrative['risk']).toContain('main risk');
    } finally {
      mock.restore();
    }
  });

  it('answers a free-form question', async () => {
    const mock = mockFetch(() => ({ choices: [{ message: { content: 'Because of Article 5.' } }] }));
    try {
      const client = new LlmClient(new OpenAIProvider({ provider: 'openai', apiKey: 'sk-test', model: 'm' }));
      expect(await client.ask('why?')).toBe('Because of Article 5.');
    } finally {
      mock.restore();
    }
  });

  it('pings an unreachable provider without throwing', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error('ECONNREFUSED');
    }) as typeof fetch;
    try {
      const client = new LlmClient(new OpenAIProvider({ provider: 'openai', apiKey: 'k', model: 'm' }));
      const ping = await client.ping();
      expect(ping.ok).toBe(false);
      expect(ping.error).toContain('ECONNREFUSED');
    } finally {
      globalThis.fetch = original;
    }
  });
});