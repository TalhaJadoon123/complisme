/**
 * CompliSME desktop server.
 *
 * A self-contained HTTP server that serves the GUI and exposes the same engine
 * the CLI and the hosted API use. It binds to 127.0.0.1 only, holds no
 * credentials, and stores the workspace in a plain folder the user can see.
 *
 * Why a local server rather than Electron: Electron, Tauri and Qt all need a
 * per-platform toolchain and a 100MB+ download to inspect 125 questions. A
 * browser-based interface on 127.0.0.1 gives the same desktop experience —
 * launch, work, close — with a 40MB footprint, no native compilation, and the
 * option to open it in a browser from another machine.
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { ComplianceEngine } from '@complisme/core';
import { applicableFrameworks, frameworkStats, getFramework, listFrameworks, selectedFrameworks } from '@complisme/frameworks';
import { DocumentGenerator } from '@complisme/generator';
import { llmStatus } from '@complisme/llm';
import { CodeScanner, summariseScan } from '@complisme/scanner';
import { isWithin } from '@complisme/scanner';
import {
  PRICING,
  companyProfileSchema,
  formatDateEU,
  nowIso,
  safeJsonParse,
  uuid,
} from '@complisme/shared';
import type { Answers, AnswerValue, CompanyProfile, DocumentKind, Evidence } from '@complisme/shared';
import { deriveSize } from '@complisme/core';

import { renderApp } from './ui';

export interface DesktopOptions {
  port?: number;
  host?: string;
  /** Directory holding the workspace, generated documents and settings. */
  workspaceDir: string;
  /** Directory the scanner is allowed to read. */
  scanRoot?: string;
  open?: boolean;
}

export interface DesktopServer {
  server: http.Server;
  url: string;
  port: number;
  close(): Promise<void>;
}

interface State {
  profile?: CompanyProfile;
  answers: Answers;
  evidence: Evidence[];
  documents: Array<Record<string, unknown>>;
}

export class DesktopApp {
  private readonly engine = new ComplianceEngine();
  private readonly generator = new DocumentGenerator();
  private state: State = { answers: {}, evidence: [], documents: [] };
  readonly workspaceDir: string;
  readonly scanRoot: string;

  constructor(private readonly options: DesktopOptions) {
    this.workspaceDir = path.resolve(options.workspaceDir);
    this.scanRoot = path.resolve(options.scanRoot ?? process.cwd());
    this.load();
  }

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  private get statePath(): string {
    return path.join(this.workspaceDir, 'state.json');
  }

  private load(): void {
    fs.mkdirSync(path.join(this.workspaceDir, 'documents'), { recursive: true });
    if (!fs.existsSync(this.statePath)) return;
    const saved = safeJsonParse<State>(fs.readFileSync(this.statePath, 'utf8'), {
      answers: {},
      evidence: [],
      documents: [],
    });
    this.state = { ...saved, answers: saved.answers ?? {}, evidence: saved.evidence ?? [] };
  }

  private save(): void {
    fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2), 'utf8');
  }

  // -------------------------------------------------------------------------
  // Operations
  // -------------------------------------------------------------------------

  overview() {
    const profile = this.state.profile;
    const plan = profile
      ? this.engine.plan(profile, this.state.answers, { evidence: this.state.evidence })
      : undefined;

    return {
      version: '1.0.0',
      workspace: this.workspaceDir,
      hasProfile: !!profile,
      profile: profile ?? null,
      overall: plan?.overall ?? 0,
      grade: plan?.grade ?? null,
      scores:
        plan?.scores.map((s) => ({
          frameworkId: s.frameworkId,
          score: s.score,
          grade: s.grade,
          gaps: s.gaps.length,
        })) ?? [],
      gaps: plan?.gaps.slice(0, 60) ?? [],
      summary: plan?.summary ?? null,
      applicability: profile ? applicableFrameworks(profile) : [],
      countdowns: buildCountdowns(),
      frameworks: frameworkStats(),
      documents: this.state.documents.slice(0, 20),
      evidenceCount: this.state.evidence.length,
      // A list, not a record: the GUI iterates it directly.
      plans: Object.entries(PRICING).map(([id, plan]) => ({ id, ...plan })),
      generatedAt: nowIso(),
    };
  }

  saveProfile(input: unknown): { profile?: CompanyProfile; error?: unknown } {
    const parsed = companyProfileSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.flatten() };
    }
    const profile = parsed.data as CompanyProfile;
    this.state.profile = {
      ...profile,
      id: profile.id || uuid(),
      size: profile.size ?? deriveSize(profile.employees ?? 0, profile.revenueEUR ?? 0),
      createdAt: profile.createdAt ?? nowIso(),
      updatedAt: nowIso(),
    };
    this.save();
    return { profile: this.state.profile };
  }

  setAnswers(updates: Record<string, Record<string, AnswerValue>>) {
    this.state.answers = { ...this.state.answers, ...updates };
    this.save();
    const plan = this.state.profile
      ? this.engine.plan(this.state.profile, this.state.answers, { evidence: this.state.evidence })
      : undefined;
    return {
      answers: this.state.answers,
      overall: plan?.overall ?? 0,
      grade: plan?.grade ?? null,
      gaps: plan?.summary.total ?? 0,
    };
  }

  roadmap(horizon = 90) {
    if (!this.state.profile) return { error: 'no_profile' };
    const plan = this.engine.plan(this.state.profile, this.state.answers, {
      evidence: this.state.evidence,
      horizonDays: horizon,
    });
    return { roadmap: plan.roadmap, gaps: plan.gaps };
  }

  async scan(target: string) {
    // Path confinement: the desktop app still must not be tricked into reading
    // outside the folder the user pointed it at.
    const resolved = path.resolve(this.scanRoot, target);
    if (!isWithin(this.scanRoot, resolved) || !fs.existsSync(resolved)) {
      return { error: 'invalid_path', detail: `${target} is outside ${this.scanRoot}` };
    }
    const result = await new CodeScanner().scan({ root: resolved });
    return {
      root: result.root,
      filesScanned: result.filesScanned,
      findings: result.findings.slice(0, 200),
      gaps: result.gaps,
      summary: summariseScan(result),
      dataFlow: result.dataFlow,
      truncated: result.truncated,
    };
  }

  async generate(kind: string) {
    if (!this.state.profile) return { error: 'no_profile' };
    const plan = this.engine.plan(this.state.profile, this.state.answers, {
      evidence: this.state.evidence,
    });

    const result = await this.generator.generate({
      kind: kind as DocumentKind,
      profile: this.state.profile,
      answers: this.state.answers,
      evidence: this.state.evidence,
      gaps: plan.gaps,
      roadmap: plan.roadmap,
      format: 'pdf',
      // Always a directory: the generator owns the filename.
      outputPath: path.join(this.workspaceDir, 'documents'),
    });

    const record = {
      id: randomUUID(),
      kind,
      title: result.title,
      format: result.format,
      path: result.path,
      bytes: result.bytes,
      sections: result.sections,
      words: result.wordCount,
      at: nowIso(),
    };
    this.state.documents.unshift(record);
    this.save();
    return record;
  }

  async aiStatus() {
    return llmStatus();
  }
}

function buildCountdowns() {
  // Imported lazily to keep this module's imports focused.
  const { COUNTDOWN_EVENTS } = require('@complisme/shared') as typeof import('@complisme/shared');
  return COUNTDOWN_EVENTS.map((event: (typeof COUNTDOWN_EVENTS)[number]) => ({
    ...event,
    daysRemaining: Math.ceil((new Date(event.date).getTime() - Date.now()) / 86_400_000),
  }));
}

// ---------------------------------------------------------------------------
// HTTP layer
// ---------------------------------------------------------------------------

export async function startDesktop(options: DesktopOptions): Promise<DesktopServer> {
  const app = new DesktopApp(options);
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 4317;

  const html = renderApp();
  const assetsDir = path.join(__dirname, 'assets');

  const server = http.createServer((request, response) => {
    void handle(app, request, response, html, assetsDir);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });

  const actual = (server.address() as { port: number }).port;
  return {
    server,
    port: actual,
    url: `http://${host}:${actual}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

async function handle(
  app: DesktopApp,
  request: http.IncomingMessage,
  response: http.ServerResponse,
  html: string,
  assetsDir: string,
): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://localhost');
  const send = (status: number, body: unknown) => {
    response.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    response.end(JSON.stringify(body));
  };

  try {
    // Static assets (the GUI is a single self-contained file, so this is rarely used).
    if (url.pathname.startsWith('/assets/')) {
      const name = path.basename(url.pathname);
      const file = path.join(assetsDir, name);
      if (isWithin(assetsDir, file) && fs.existsSync(file)) {
        response.writeHead(200, { 'content-type': 'text/css; charset=utf-8' });
        response.end(fs.readFileSync(file));
        return;
      }
      send(404, { error: 'not_found' });
      return;
    }

    if (url.pathname.startsWith('/api/')) {
      const body = await readBody(request);
      const route = `${request.method} ${url.pathname}`;

      switch (route) {
        case 'GET /api/overview':
          send(200, app.overview());
          return;
        case 'POST /api/profile':
          send(200, app.saveProfile(body));
          return;
        case 'POST /api/answers': {
          const result = app.setAnswers(body as Record<string, Record<string, AnswerValue>>);
          send(200, result);
          return;
        }
        case 'GET /api/roadmap':
          send(200, app.roadmap(Number(url.searchParams.get('horizon') ?? 90)));
          return;
        case 'POST /api/scan':
          send(200, await app.scan(String((body as { path?: string })?.path ?? '.')));
          return;
        case 'POST /api/generate':
          send(200, await app.generate(String((body as { kind?: string })?.kind ?? 'compliance-roadmap')));
          return;
        case 'GET /api/ai/status':
          send(200, await app.aiStatus());
          return;
        case 'GET /api/frameworks':
          send(200, { frameworks: listFrameworks().map((f) => ({ id: f.id, name: f.name })) });
          return;
        case 'GET /api/framework': {
          const id = url.searchParams.get('id') ?? 'gdpr';
          try {
            send(200, getFramework(id));
          } catch (error) {
            send(404, { error: (error as Error).message });
          }
          return;
        }
        default:
          send(404, { error: 'not_found', route });
      }
      return;
    }

    // Everything else renders the single-page app.
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'no-referrer',
    });
    response.end(html);
  } catch (error) {
    send(500, { error: (error as Error).message });
  }
}

async function readBody(request: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    // Bound the body: this is a local app but there is no reason to be greedy.
    if (size > 5 * 1024 * 1024) throw new Error('request body too large');
    chunks.push(chunk as Buffer);
  }
  if (!chunks.length) return {};
  return safeJsonParse<unknown>(Buffer.concat(chunks).toString('utf8'), {});
}

export { formatDateEU, listFrameworks };
