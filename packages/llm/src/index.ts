/**
 * LLM-assisted compliance: gap analysis and document drafting.
 *
 * Every function here degrades gracefully. With no provider configured, or when
 * the model returns something unusable, the deterministic rule-based result is
 * returned with a `source: 'rules'` marker so the product keeps working.
 */

import {
  gapId as makeGapId,
  gapId as stableGapId,
  llmDraftSchema,
  llmGapAnalysisSchema,
  nowIso,
  round,
  severityFromExposure,
  uniq,
} from '@complisme/shared';
import type {
  Answers,
  CompanyProfile,
  DocumentKind,
  Framework,
  Gap,
  LlmDraft,
  LlmGapAnalysis,
  Severity,
} from '@complisme/shared';

import {
  LlmError,
  LlmNotConfiguredError,
  createProvider,
  detectConfig,
  isLlmAvailable,
  providerFromEnv,
  type LlmConfig,
  type LlmEnv,
  type Provider,
} from './provider';
import { gapAnalysisMessages } from './prompts/gap-analysis';
import { documentDraftMessages, SECTION_PLANS, type DraftSectionId } from './prompts/document-draft';
import { redact } from './redact';

export interface LlmRun<T> {
  value: T;
  used: boolean;
  /** Populated when the model was called but its output was rejected. */
  warning?: string;
  model?: string;
  provider?: string;
  latencyMs?: number;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
}

/** A document draft plus the narrative keyed by template section id. */
export interface DraftRun extends LlmRun<LlmDraft> {
  narrative: Record<string, string>;
}

/** A gap analysis run plus the converted, engine-ready gaps. */
export interface GapRun extends LlmRun<LlmGapAnalysis> {
  gaps: Gap[];
}

/**
 * High-level client. Construct with a provider, or with `fromEnv()`.
 */
export class LlmClient {
  constructor(private readonly provider: Provider) {}

  static fromEnv(env: LlmEnv = process.env as LlmEnv): LlmClient | null {
    const provider = providerFromEnv(env);
    return provider ? new LlmClient(provider) : null;
  }

  static fromConfig(config: LlmConfig): LlmClient {
    return new LlmClient(createProvider(config));
  }

  get isAvailable(): boolean {
    try {
      return this.provider.isConfigured();
    } catch {
      return false;
    }
  }

  get model(): string {
    return this.provider.model;
  }

  get providerName(): string {
    return this.provider.name;
  }

  /**
   * Ask the model for additional gaps on top of the deterministic ones.
   * Never throws: failures are reported through `warning` and an empty `gaps`.
   */
  async analyseGaps(input: {
    profile: CompanyProfile;
    framework: Framework;
    answers: Answers;
    existingGaps?: Gap[];
    redactIdentifiers?: boolean;
    temperature?: number;
  }): Promise<GapRun> {
    const empty: LlmGapAnalysis = { summary: '', gaps: [] };

    if (!this.isAvailable) {
      return {
        value: empty,
        gaps: [],
        used: false,
        warning: 'No LLM provider configured — using rule-based gaps only.',
      };
    }

    const existingKeys = (input.existingGaps ?? [])
      .filter((g) => g.frameworkId === input.framework.id)
      .map((g) => `${g.articleId}: ${g.title}`);

    try {
      const { value, response } = await this.provider.completeJson(
        {
          messages: gapAnalysisMessages({
            profile: input.profile,
            framework: input.framework,
            answers: input.answers,
            existingGapKeys: uniq(existingKeys),
            redactIdentifiers: input.redactIdentifiers,
          }),
          temperature: input.temperature ?? 0.2,
          maxTokens: 4000,
        },
        llmGapAnalysisSchema,
      );

      const gaps = value.gaps
        .filter((g) => input.framework.articles.some((a) => a.id === g.articleId))
        .map((g) => this.toGap(g, input, input.framework));

      return {
        value,
        gaps,
        used: true,
        model: response.model,
        provider: response.provider,
        latencyMs: response.latencyMs,
        usage: response.usage,
      };
    } catch (error) {
      return {
        value: empty,
        gaps: [],
        used: false,
        warning: llmWarning(error),
      };
    }
  }

  private toGap(
    raw: { articleId: string; title: string; severity: Severity; remediation: string; effort: number; fineExposure?: number; confidence?: number },
    input: { profile: CompanyProfile },
    framework: Framework,
  ): Gap {
    const article = framework.articles.find((a) => a.id === raw.articleId);
    const severity: Severity = raw.severity ?? severityFromExposure(raw.fineExposure ?? article?.fineExposure);
    return {
      id: `llm-${stableGapId(input.profile.id, framework.id, raw.articleId, raw.title.slice(0, 40))}`,
      frameworkId: framework.id,
      articleId: raw.articleId,
      title: raw.title,
      description: 'Identified by the assisted review rather than by the standard questionnaire.',
      severity,
      remediation: raw.remediation,
      effort: Math.max(0.5, raw.effort ?? 3),
      deadline: article?.deadline ? new Date(`${article.deadline}T00:00:00Z`) : undefined,
      deadlineIso: article?.deadline,
      fineExposure: raw.fineExposure ?? article?.fineExposure,
      citation: article?.reference,
      source: 'llm',
      status: 'open',
      confidence: Math.min(0.9, Math.max(0.3, raw.confidence ?? 0.5)),
    };
  }

  /**
   * Draft narrative sections for a document. Returns an empty draft when the
   * provider is unavailable or the output is unusable.
   */
  async draftDocument(input: {
    kind: DocumentKind;
    profile: CompanyProfile;
    framework?: Framework;
    answers?: Answers;
    gaps?: Gap[];
    scores?: Array<{ frameworkId: string; score: number; grade?: string }>;
    sections?: Array<{ id: DraftSectionId; instruction: string; minWords?: number }>;
    redactIdentifiers?: boolean;
    temperature?: number;
  }): Promise<DraftRun> {
    const empty: LlmDraft = { sections: [] };

    if (!this.isAvailable) {
      return {
        value: empty,
        used: false,
        narrative: {},
        warning: 'No LLM provider configured — using template narrative only.',
      };
    }

    const plan = input.sections ?? SECTION_PLANS[input.kind] ?? [];

    try {
      const { value, response } = await this.provider.completeJson(
        {
          messages: documentDraftMessages({
            kind: input.kind,
            profile: input.profile,
            framework: input.framework,
            answers: input.answers,
            gaps: input.gaps,
            scores: input.scores,
            sections: plan,
            redactIdentifiers: input.redactIdentifiers,
          }),
          temperature: input.temperature ?? 0.4,
          maxTokens: 6000,
        },
        llmDraftSchema,
      );

      // Re-key the returned sections back onto the template's section ids.
      const narrative: Record<string, string> = {};
      const sections = value.sections.map((section, index) => {
        const targetId = plan[index]?.id ?? section.heading;
        narrative[targetId] = section.body;
        return { heading: targetId, body: section.body, wordCount: section.wordCount };
      });

      return {
        value: { sections },
        used: true,
        model: response.model,
        provider: response.provider,
        latencyMs: response.latencyMs,
        usage: response.usage,
        narrative,
      };
    } catch (error) {
      return { value: empty, used: false, narrative: {}, warning: llmWarning(error) };
    }
  }

  /** Free-form completion, used by the CLI for ad-hoc questions. */
  async ask(prompt: string, options: { system?: string; temperature?: number; maxTokens?: number } = {}): Promise<string> {
    if (!this.isAvailable) throw new LlmNotConfiguredError();
    const response = await this.provider.complete({
      messages: [
        ...(options.system ? [{ role: 'system' as const, content: options.system }] : []),
        { role: 'user' as const, content: prompt },
      ],
      temperature: options.temperature ?? 0.3,
      maxTokens: options.maxTokens ?? 2000,
    });
    return response.text;
  }

  /** Health probe: is the configured provider reachable? */
  async ping(): Promise<{ ok: boolean; provider: string; model: string; latencyMs?: number; error?: string }> {
    if (!this.isAvailable) {
      return { ok: false, provider: this.provider.name, model: this.provider.model, error: 'not configured' };
    }
    try {
      const started = Date.now();
      await this.provider.complete({
        messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
        maxTokens: 8,
      });
      return { ok: true, provider: this.provider.name, model: this.provider.model, latencyMs: Date.now() - started };
    } catch (error) {
      return { ok: false, provider: this.provider.name, model: this.provider.model, error: llmWarning(error) };
    }
  }
}

function llmWarning(error: unknown): string {
  if (error instanceof LlmNotConfiguredError) return 'No LLM provider configured.';
  if (error instanceof LlmError) return `LLM call failed: ${error.message}`;
  if (error && typeof error === 'object' && 'issues' in error) {
    return `Model output did not match the expected schema: ${JSON.stringify((error as { issues: unknown[] }).issues).slice(0, 300)}`;
  }
  return `LLM call failed: ${(error as Error).message}`;
}

// ---------------------------------------------------------------------------
// Module-level convenience API used by the CLI
// ---------------------------------------------------------------------------

let cachedClient: LlmClient | null | undefined;

/** Cached client from the environment. Returns null when no provider is set. */
export function client(): LlmClient | null {
  if (cachedClient === undefined) cachedClient = LlmClient.fromEnv();
  return cachedClient;
}

export function resetClient(): void {
  cachedClient = undefined;
}

export function llmAvailable(): boolean {
  return isLlmAvailable();
}

export function llmConfig(): LlmConfig | null {
  return detectConfig();
}

/** Status block for the CLI and the API `/health`. */
export async function llmStatus(): Promise<{
  configured: boolean;
  provider?: string;
  model?: string;
  reachable?: boolean;
  latencyMs?: number;
  error?: string;
  note: string;
}> {
  const c = client();
  if (!c) {
    return {
      configured: false,
      note: 'No LLM provider configured. Set OPENAI_API_KEY, ANTHROPIC_API_KEY or OLLAMA_BASE_URL to enable AI-assisted gap analysis and document drafting. Rules-based compliance works without any key.',
    };
  }
  const ping = await c.ping();
  return {
    configured: true,
    provider: ping.provider,
    model: ping.model,
    reachable: ping.ok,
    latencyMs: ping.latencyMs,
    error: ping.error,
    note: 'AI features enabled. Company identifiers are redacted before anything is sent.',
  };
}

export { makeGapId, round, nowIso, redact };
export * from './provider';
export * from './redact';
export { GAP_ANALYSIS_SYSTEM, buildGapAnalysisPrompt, gapAnalysisMessages } from './prompts/gap-analysis';
export { DOCUMENT_SYSTEM, SECTION_PLANS, buildDocumentPrompt, documentDraftMessages } from './prompts/document-draft';
export type { DraftSectionId };