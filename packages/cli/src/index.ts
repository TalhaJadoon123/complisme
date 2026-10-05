/**
 * `complisme` CLI.
 *
 * Design: every command works offline against a local `.complisme/` workspace.
 * No account, no server, no API key required. Commands that can use an LLM
 * (--ai) say so clearly when none is configured instead of failing.
 */

import { Command, Option } from 'commander';

import { ComplianceEngine, overdueGaps, profileFacts, summariseGaps } from '@complisme/core';
import { applicableFrameworks, frameworkStats, getFramework, listFrameworks, selectedFrameworks } from '@complisme/frameworks';
import { DocumentGenerator } from '@complisme/generator';
import { LlmClient, llmStatus, resetClient } from '@complisme/llm';
import { CodeScanner, findingsToIssues, gapToIssue, githubStatus, publishIssues, summariseScan } from '@complisme/scanner';
import {
  FRAMEWORK_LABELS,
  PRICING,
  companyProfileSchema,
  documentKindSchema,
  formatDateEU,
  formatEuro,
  formatNumber,
  nowIso,
} from '@complisme/shared';
import type { CompanyProfile, DocumentKind, Finding } from '@complisme/shared';

import {
  bar,
  c,
  heading,
  kv,
  print,
  printError,
  printJson,
  printWarning,
  renderFindings,
  renderGaps,
  renderRoadmap,
  renderScores,
  renderTable,
  scoreColor,
  severityLabel,
} from './output';
import {
  addEvidence,
  appendHistory,
  ensureWorkspace,
  loadAnswers,
  loadDocuments,
  loadEvidence,
  loadHistory,
  loadProfile,
  outputDir,
  parseAnswerArgs,
  recordAssessment,
  recordDocument,
  requireProfile,
  resolveWorkspace,
  saveProfile,
  setAnswers,
  type Workspace,
} from './workspace';
import { promptForProfile, promptForAnswers, promptConfirm } from './prompts';
import { publishStatus, registerPublishCommand } from './commands/publish';

const VERSION = '1.0.0';

export interface GlobalOptions {
  dir?: string;
  global?: boolean;
  json?: boolean;
  yes?: boolean;
  profile?: string;
}

function workspaceFor(options: GlobalOptions): Workspace {
  return ensureWorkspace(resolveWorkspace({ dir: options.dir, global: options.global }));
}

function loadProfileFrom(input: GlobalOptions, workspace: Workspace): CompanyProfile {
  if (!input.profile) return requireProfile(workspace);
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require('node:fs') as typeof import('node:fs');
  if (!fs.existsSync(input.profile)) throw new Error(`profile file not found: ${input.profile}`);
  // The Zod output widens `dataSubjects` to string[]; the engine accepts that,
  // so normalise back to the domain type here.
  const parsed = companyProfileSchema.parse(JSON.parse(fs.readFileSync(input.profile, 'utf8')));
  return parsed as CompanyProfile;
}

export function buildProgram(): Command {
  const program = new Command();

  program
    .name('complisme')
    .description(
      'Multi-framework compliance for SMEs: EU AI Act, CSRD/ESRS, GDPR and e-invoicing in one tool.',
    )
    .version(VERSION)
    .option('--dir <path>', 'workspace directory (default: current directory)')
    .option('--global', 'use the global workspace in ~/.complisme instead of ./.complisme')
    .option('--json', 'emit machine readable JSON')
    .option('-y, --yes', 'skip interactive prompts')
    .showHelpAfterError()
    .configureOutput({
      writeErr: (str) => process.stderr.write(str),
      writeOut: (str) => process.stdout.write(str),
    });

  program
    .command('init')
    .description('create a workspace and describe your company')
    .option('-n, --name <name>', 'company name')
    .option('-c, --country <cc>', 'ISO country code (e.g. NL, DE, BR)')
    .option('--sector <sector>', 'sector (e.g. software, manufacturing, consulting)')
    .option('-e, --employees <n>', 'number of employees', (v) => Number(v))
    .option('--revenue <eur>', 'annual turnover in EUR', (v) => Number(v))
    .option('--ai-domain <domain>', 'primary AI use case domain (e.g. employment, customer-service)')
    .option('--personal-data', 'the company processes personal data')
    .option('--cookies', 'the company uses cookies')
    .option('--demo', 'load a demo company instead of prompting')
    .action(async (options) => {
      const globals = program.opts<GlobalOptions>();
      const workspace = workspaceFor(globals);
      let profile = loadProfile(workspace);

      if (options.demo) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { vistaSul } = require('@complisme/core') as typeof import('@complisme/core');
        profile = saveProfile(workspace, vistaSul());
        print(c.green(`Created a demo workspace with ${profile.name} at ${workspace.dir}`));
        print(c.grey('Run `complisme status` to see the assessment, or `complisme roadmap`.'));
        return;
      }

      if (options.name || options.country) {
        profile = saveProfile(
          workspace,
          requireProfile(workspace),
        );
        const merged = {
          ...profile,
          name: options.name ?? profile.name,
          country: options.country ?? profile.country,
          sector: options.sector ?? profile.sector,
          employees: options.employees ?? profile.employees,
          revenueEUR: options.revenue ?? profile.revenueEUR,
          usesCookies: options.cookies ? true : options.personalData ? profile.usesCookies : undefined,
        };
        profile = saveProfile(workspace, merged);
      } else if (!profile || globals.yes === undefined) {
        const answers = await promptForProfile(profile);
        profile = saveProfile(workspace, answers as never);
      } else {
        profile = saveProfile(workspace, profile);
      }

      appendHistory(workspace, 'init', profile.name);

      if (globals.json) {
        printJson(profile);
        return;
      }

      print();
      print(c.boldGreen(`  ${profile.legalName ?? profile.name}`));
      print(c.grey(`  ${profile.sector} · ${profile.country} · ${profile.employees} employees · ${formatEuro(profile.revenueEUR)}`));
      print();
      print(kv('Workspace', workspace.dir));

      const applicable = applicableFrameworks(profile);
      print();
      print(c.bold('  Frameworks in scope'));
      for (const entry of applicable) {
        const mark = entry.applies ? c.green('✔ in scope  ') : c.grey('– not in scope');
        print(`  ${mark}  ${FRAMEWORK_LABELS[entry.frameworkId] ?? entry.frameworkId}`);
        print(c.grey(`              ${entry.reason}`));
      }
      print();
      print(c.grey('  Next: complisme answer          answer the questionnaires'));
      print(c.grey('        complisme status          see the readiness scores'));
      print(c.grey('        complisme roadmap         get the 90-day plan'));
      print(c.grey('        complisme generate        produce your Annex IV, ROPA, DPIA…'));
      print();
    });

  program
    .command('answer')
    .description('record answers to the questionnaires')
    .argument('[answers...]', 'framework.question=value pairs, e.g. gdpr.a5-q1=documented')
    .addOption(new Option('--clear', 'remove an answer').default(false))
    .addOption(new Option('--interactive', 'answer the questions one by one').default(false))
    .addOption(new Option('--framework <id>', 'restrict interactive answering to one framework'))
    .action(async (answers: string[], options) => {
      const globals = program.opts<GlobalOptions>();
      const workspace = workspaceFor(globals);
      const profile = requireProfile(workspace);

      if (options.interactive && !answers.length) {
        const updated = await promptForAnswers(profile, loadAnswers(workspace), options.framework);
        setAnswers(workspace, updated);
        appendHistory(workspace, 'answer --interactive');
        if (globals.json) printJson(loadAnswers(workspace));
        else print(c.green(`\n  Saved ${updated.length} answers.`));
        return;
      }

      if (!answers.length) {
        printError('Provide at least one answer, e.g. gdpr.a5-q1=documented, or use --interactive.');
        process.exitCode = 1;
        return;
      }

      const parsed = parseAnswerArgs(answers);
      const updates = options.clear
        ? parsed.map((a) => ({ frameworkId: a.frameworkId, questionId: a.questionId, value: null }))
        : parsed;

      // Warn about unknown question ids — typos silently create dead answers.
      const known = new Set<string>();
      for (const frameworkId of selectedFrameworks(profile)) {
        try {
          for (const article of getFramework(frameworkId).articles) {
            for (const question of article.questionnaire) known.add(`${frameworkId}.${question.id}`);
          }
        } catch {
          /* unknown framework */
        }
      }
      for (const update of parsed) {
        const key = `${update.frameworkId}.${update.questionId}`;
        if (!known.has(key)) printWarning(`no question "${key}" in the loaded frameworks — stored anyway`);
      }

      setAnswers(workspace, updates);
      appendHistory(workspace, 'answer', updates.map((u) => `${u.frameworkId}.${u.questionId}`).join(','));
      if (globals.json) {
        printJson(loadAnswers(workspace));
      } else {
        print(c.green(`  ${options.clear ? 'Cleared' : 'Recorded'} ${updates.length} answer(s).`));
      }
    });

  program
    .command('status')
    .description('show readiness scores, gaps and deadlines')
    .option('--limit <n>', 'number of gaps to list', (v) => Number(v), 10)
    .action((options) => {
      const globals = program.opts<GlobalOptions>();
      const workspace = workspaceFor(globals);
      const profile = loadProfileFrom(globals, workspace);
      const answers = loadAnswers(workspace);
      const evidence = loadEvidence(workspace);

      const engine = new ComplianceEngine();
      const result = engine.assessDetailed(profile, answers, { evidence, companyId: profile.id });

      if (globals.json) {
        printJson(result);
        return;
      }

      print();
      print(c.bold(`  ${profile.legalName ?? profile.name}`));
      print(c.grey(`  ${formatDateEU(nowIso())}`));
      for (const line of renderScores(result.scores, FRAMEWORK_LABELS)) print(line);

      const overdue = overdueGaps(result.gaps, new Date());
      if (overdue.length) {
        print();
        print(c.boldRed(`  ${overdue.length} item(s) are past their statutory deadline`));
        for (const gap of overdue.slice(0, 3)) {
          print(c.grey(`    due ${gap.deadlineIso}  ${(gap.title ?? gap.articleId).slice(0, 90)}`));
        }
      }

      const urgent = engine.urgent(result.gaps, 90);
      if (urgent.length) {
        print();
        print(c.bold(`  ${urgent.length} item(s) become non-compliant within 90 days`));
        for (const gap of urgent.slice(0, 5)) {
          print(c.grey(`    ${gap.deadlineIso}  ${(gap.title ?? gap.articleId).slice(0, 90)}`));
        }
      }

      for (const line of renderGaps(result.gaps, options.limit)) print(line);

      const summary = result.summary;
      print();
      print(
        c.grey(
          `  ${summary.total} gaps · ${summary.bySeverity.error} errors · ${summary.effort} person-days · ` +
            `highest single exposure ${formatEuro(summary.fineExposure)}`,
        ),
      );
      print();
    });

  program
    .command('gap')
    .description('list gaps, optionally enriched by AI and the codebase scanner')
    .option('--limit <n>', 'number of gaps to list', (v) => Number(v), 20)
    .option('--severity <level>', 'filter: error, warning, info')
    .option('--framework <id>', 'filter by framework')
    .option('--scan <path>', 'also scan a codebase and merge its gaps')
    .addOption(new Option('--ai', 'use the configured LLM to find additional gaps').default(false))
    .action(async (options) => {
      const globals = program.opts<GlobalOptions>();
      const workspace = workspaceFor(globals);
      const profile = loadProfileFrom(globals, workspace);
      const answers = loadAnswers(workspace);
      const evidence = loadEvidence(workspace);
      const engine = new ComplianceEngine();

      let findings: Finding[] = [];
      if (options.scan) {
        const scanner = new CodeScanner();
        const scan = await scanner.scan({ root: options.scan });
        findings = scan.findings;
        if (!globals.json) {
          const summary = summariseScan(scan);
          print(
            c.grey(
              `  Scanned ${scan.filesScanned} files — ${summary.total} findings ` +
                `(${Object.entries(summary.bySeverity).map(([k, v]) => `${v} ${k}`).join(', ')})`,
            ),
          );
        }
      }

      const result = engine.assessDetailed(profile, answers, { evidence, findings, companyId: profile.id });
      let gaps = result.gaps;

      if (options.ai) {
        resetClient();
        const client = LlmClient.fromEnv();
        if (!client) {
          printWarning(
            'No LLM provider configured (OPENAI_API_KEY / ANTHROPIC_API_KEY / OLLAMA_BASE_URL). Showing rule-based gaps only.',
          );
        } else {
          const extra: typeof gaps = [];
          for (const frameworkId of selectedFrameworks(profile)) {
            let framework;
            try {
              framework = getFramework(frameworkId);
            } catch {
              continue;
            }
            const run = await client.analyseGaps({ profile, framework, answers, existingGaps: gaps });
            if (run.warning) printWarning(`${frameworkId}: ${run.warning}`);
            extra.push(...run.gaps);
          }
          const before = gaps.length;
          gaps = [...gaps, ...extra];
          if (!globals.json) print(c.grey(`  AI review added ${gaps.length - before} gap(s).`));
        }
      }

      if (options.framework) gaps = gaps.filter((g) => g.frameworkId === options.framework);
      if (options.severity) gaps = gaps.filter((g) => g.severity === options.severity);

      if (globals.json) {
        printJson({ gaps, summary: summariseGaps(gaps) });
        return;
      }
      for (const line of renderGaps(gaps, options.limit)) print(line);
    });

  program
    .command('roadmap')
    .description('build the 90-day remediation roadmap')
    .option('--horizon <days>', 'planning horizon in days', (v) => Number(v), 90)
    .option('--capacity <days>', 'person-days available per phase', (v) => Number(v))
    .option('--write <file>', 'also write the plan as JSON')
    .action((options) => {
      const globals = program.opts<GlobalOptions>();
      const workspace = workspaceFor(globals);
      const profile = loadProfileFrom(globals, workspace);
      const engine = new ComplianceEngine();
      const plan = engine.plan(profile, loadAnswers(workspace), {
        horizonDays: options.horizon,
        capacityPerPhase: options.capacity,
      });

      appendHistory(workspace, 'roadmap', `${plan.gaps.length} gaps`);
      recordAssessment(workspace, {
        companyId: profile.id,
        frameworkId: plan.scores[0]?.frameworkId ?? 'gdpr',
        answers: loadAnswers(workspace),
        scores: plan.scores,
        evidence: loadEvidence(workspace),
      });

      if (options.write) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const fs = require('node:fs') as typeof import('node:fs');
        fs.writeFileSync(options.write, JSON.stringify(plan.roadmap, null, 2));
      }

      if (globals.json) {
        printJson(plan);
        return;
      }

      for (const line of renderRoadmap(plan.roadmap)) print(line);
      if (plan.roadmap.disclaimer) print(c.grey(`\n  ${plan.roadmap.disclaimer}`));
      print();
    });

  program
    .command('scan')
    .description('scan a codebase and map findings to compliance articles')
    .argument('<path>', 'directory to scan')
    .option('--include <glob...>', 'only scan matching paths')
    .option('--exclude <glob...>', 'extra exclude globs')
    .addOption(new Option('--ruleset <set>', 'which rule families to run').choices(['gdpr', 'ai-act', 'all']).default('all'))
    .option('--max-files <n>', 'maximum files to scan', (v) => Number(v), 5000)
    .option('--fail-on <level>', 'exit non-zero at or above this severity')
    .option('--write <file>', 'write the full result as JSON')
    .option('--gaps', 'print compliance gaps instead of raw findings')
    .action(async (target: string, options) => {
      const globals = program.opts<GlobalOptions>();
      const workspace = workspaceFor(globals);

      const scanner = new CodeScanner();
      const result = await scanner.scan({
        root: target,
        include: options.include,
        exclude: options.exclude,
        ruleset: options.ruleset,
        maxFiles: options.maxFiles,
      });

      if (options.write) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const fs = require('node:fs') as typeof import('node:fs');
        fs.writeFileSync(options.write, JSON.stringify(result, null, 2));
      }

      if (globals.json) {
        printJson(result);
      } else if (options.gaps) {
        for (const line of renderGaps(result.gaps, 30)) print(line);
      } else {
        print();
        print(
          kv('Scanned', `${result.filesScanned} files · ${formatNumber(result.bytesScanned / 1024)} KB · ${
            Object.entries(result.languages).map(([k, v]) => `${v} ${k}`).join(', ')
          }`),
        );
        print(kv('Parsers', Object.entries(result.parsers).map(([k, v]) => `${k}:${v}`).join(', ')));
        if (result.truncated) printWarning('File limit reached — results are partial.');
        for (const line of renderFindings(result.findings, 25)) print(line);
        print();
        print(c.grey(`  ${result.gaps.length} compliance gap(s) derived. Run with --gaps to see them.`));
        print();
      }

      appendHistory(workspace, 'scan', target);
      if (options.failOn) {
        const rank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
        const limit = rank[options.failOn];
        const matched = result.findings.filter((f) => (rank[f.severity] ?? 9) <= limit);
        if (matched.length) process.exitCode = 1;
      }
    });

  program
    .command('generate')
    .description('generate a compliance document')
    .addOption(
      new Option('--kind <kind>', 'document kind')
        .choices(DocumentGenerator.kinds())
        .default('compliance-roadmap'),
    )
    .option('--framework <id>', 'restrict to one framework')
    .addOption(new Option('--format <format>', 'output format').choices(['pdf', 'docx', 'html', 'json']).default('pdf'))
    .option('--out <dir>', 'output directory')
    .option('--scan <path>', 'scan this codebase and fold the findings in')
    .addOption(new Option('--ai', 'use the LLM to draft the narrative sections').default(false))
    .option('--list', 'list the available document kinds')
    .action(async (options) => {
      const globals = program.opts<GlobalOptions>();
      const workspace = workspaceFor(globals);

      if (options.list) {
        print();
        print(c.bold('  Document kinds'));
        for (const kind of DocumentGenerator.kinds()) print(`  ${kind}`);
        print();
        return;
      }

      const profile = loadProfileFrom(globals, workspace);
      const answers = loadAnswers(workspace);
      const evidence = loadEvidence(workspace);
      const engine = new ComplianceEngine();

      let findings: Finding[] = [];
      if (options.scan) {
        const scan = await new CodeScanner().scan({ root: options.scan });
        findings = scan.findings;
      }

      const plan = engine.plan(profile, answers, { findings });
      const gaps = options.framework
        ? plan.gaps.filter((g) => g.frameworkId === options.framework)
        : plan.gaps;

      let narrative: Record<string, string> | undefined;
      if (options.ai) {
        resetClient();
        const client = LlmClient.fromEnv();
        if (!client) {
          printWarning('No LLM provider configured — generating from templates only.');
        } else {
          const draft = await client.draftDocument({
            kind: options.kind as DocumentKind,
            profile,
            framework: options.framework ? getFramework(options.framework) : undefined,
            answers,
            gaps,
            scores: plan.scores,
          });
          if (draft.warning) printWarning(draft.warning);
          narrative = draft.narrative;
          if (!globals.json) {
            print(c.grey(`  AI drafted ${Object.keys(draft.narrative).length} narrative section(s).`));
          }
        }
      }

      const generator = new DocumentGenerator();
      const dir = outputDir(workspace, options.out);
      const result = await generator.generate({
        kind: options.kind as DocumentKind,
        profile,
        answers,
        evidence,
        gaps,
        roadmap: plan.roadmap,
        findings,
        narrative,
        format: options.format,
        outputPath: undefined,
      });

      const target = result.path ?? pathJoin(dir, `${options.kind}.${result.format}`);
      if (!result.path) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const fs = require('node:fs') as typeof import('node:fs');
        fs.writeFileSync(target, result.html ?? '', 'utf8');
        result.path = target;
      }

      if (result.warning) printWarning(result.warning);
      recordDocument(workspace, {
        companyId: profile.id,
        kind: options.kind as DocumentKind,
        title: result.title,
        frameworkIds: options.framework ? [options.framework] : plan.scores.map((s) => s.frameworkId),
        format: result.format as never,
        path: result.path,
        checksum: result.checksum,
        metadata: { bytes: result.bytes, sections: result.sections, words: result.wordCount },
      });
      appendHistory(workspace, 'generate', `${options.kind} (${result.format})`);

      if (globals.json) {
        printJson(result);
        return;
      }
      print();
      print(c.boldGreen(`  ${result.title}`));
      print(kv('File', result.path ?? '—'));
      print(kv('Format', `${result.format} · ${formatNumber(result.bytes)} bytes`));
      print(kv('Content', `${result.sections} sections · ${formatNumber(result.wordCount)} words`));
      print(kv('Checksum', result.checksum.slice(0, 16)));
      print();
    });

  program
    .command('evidence')
    .description('manage evidence linked to framework articles')
    .argument('<action>', 'add | list')
    .option('--framework <id>', 'framework id')
    .option('--article <id>', 'article id')
    .option('--title <title>', 'evidence title')
    .option('--type <type>', 'policy, contract, log, certificate…')
    .option('--note <note>', 'description')
    .option('--url <url>', 'link to the document')
    .action((action: string, options) => {
      const globals = program.opts<GlobalOptions>();
      const workspace = workspaceFor(globals);

      if (action === 'list') {
        const evidence = loadEvidence(workspace);
        if (globals.json) {
          printJson(evidence);
          return;
        }
        print();
        if (!evidence.length) {
          print(c.grey('  No evidence recorded yet.'));
          print(c.grey('  Add one: complisme evidence add --framework gdpr --article art-30-ropa --title "ROPA v3" --type policy'));
          print();
          return;
        }
        print(
          ...renderTable(
            ['Framework', 'Article', 'Evidence', 'Type', 'Collected'],
            evidence.map((e) => [e.frameworkId, e.articleId, e.title, e.type ?? '—', (e.collectedAt ?? '').slice(0, 10)]),
          ),
        );
        print();
        return;
      }

      if (action !== 'add') {
        printError(`unknown action "${action}" — use add or list`);
        process.exitCode = 1;
        return;
      }

      if (!options.framework || !options.article || !options.title) {
        printError('--framework, --article and --title are required.');
        process.exitCode = 1;
        return;
      }

      const item = addEvidence(workspace, {
        companyId: loadProfile(workspace)?.id ?? 'unknown',
        frameworkId: options.framework,
        articleId: options.article,
        title: options.title,
        type: options.type,
        description: options.note,
        url: options.url,
        source: 'manual',
      });
      appendHistory(workspace, 'evidence add', item.title);
      print(c.green(`  Added evidence "${item.title}" (${item.id}).`));
    });

  program
    .command('documents')
    .description('list generated documents and their version history')
    .action(() => {
      const globals = program.opts<GlobalOptions>();
      const workspace = workspaceFor(globals);
      const documents = loadDocuments(workspace);
      if (globals.json) {
        printJson(documents);
        return;
      }
      print();
      if (!documents.length) {
        print(c.grey('  No documents generated yet. Try: complisme generate --kind gdpr-dpia'));
        print();
        return;
      }
      print(
        ...renderTable(
          ['Kind', 'Title', 'Format', 'Versions', 'Updated'],
          documents.map((d) => [
            d.kind,
            d.title,
            d.format,
            String(d.versions?.length ?? 1),
            (d.updatedAt ?? d.createdAt).slice(0, 16).replace('T', ' '),
          ]),
        ),
      );
      print();
      for (const document of documents) {
        if (!document.versions?.length) continue;
        print(c.bold(`  ${document.title}`));
        for (const version of document.versions) {
          print(c.grey(`    v${version.version}  ${version.createdAt.slice(0, 10)}  ${version.changeLog ?? ''}`));
        }
        print();
      }
    });

  program
    .command('frameworks')
    .description('list the bundled framework definitions')
    .option('--json', 'emit JSON')
    .action((options) => {
      const globals = program.opts<GlobalOptions>();
      if (globals.json || options.json) {
        printJson(
          listFrameworks().map((f) => ({
            id: f.id,
            name: f.name,
            version: f.version,
            articles: f.articles.length,
            questions: f.articles.reduce((acc, a) => acc + a.questionnaire.length, 0),
          })),
        );
        return;
      }
      print();
      print(c.bold('  Frameworks'));
      for (const framework of listFrameworks()) {
        const stats = frameworkStats().find((s) => s.id === framework.id)!;
        print();
        print(`  ${c.boldCyan(framework.shortName ?? framework.name)} ${c.grey(`(${framework.version})`)}`);
        print(c.grey(`  ${framework.description?.split('\n')[0] ?? ''}`));
        print(
          c.grey(
            `  ${stats.articles} articles · ${stats.questions} questions · ` +
              `${framework.enforcementDate ? `enforced ${framework.enforcementDate}` : ''}`,
          ),
        );
      }
      print();
    });

  registerPublishCommand(program, workspaceFor);
  program
    .command('status-all')
    .description('show the environment: workspace, LLM provider, PDF support, pricing')
    .action(async () => {
      const globals = program.opts<GlobalOptions>();
      const workspace = workspaceFor(globals);
      const profile = loadProfile(workspace);
      const generator = new DocumentGenerator();
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { pdfAvailable } = require('@complisme/generator') as typeof import('@complisme/generator');
      const pdf = await pdfAvailable();
      const llm = await llmStatus();

      if (globals.json) {
        printJson({ workspace: workspace.dir, profile: profile?.name ?? null, pdf, llm });
        return;
      }

      print();
      print(heading('Environment'));
      print(kv('Version', VERSION));
      print(kv('Workspace', workspace.dir));
      print(kv('Profile', profile ? `${profile.name} (${profile.country})` : 'not created — run `complisme init`'));
      print(kv('PDF rendering', pdf ? c.green('available') : c.yellow('unavailable — install Puppeteer or use DOCX/HTML')));
      print(kv('LLM provider', llm.configured ? `${llm.provider} / ${llm.model}` : c.grey('not configured')));
      if (llm.configured) print(kv('LLM reachable', llm.reachable ? c.green('yes') : c.red(`no — ${llm.error}`)));
      print(c.grey(`              ${llm.note}`));

      const gh = await publishStatus();
      print(
        kv(
          'GitHub',
          gh.configured
            ? `${gh.repo} · ${gh.authenticated ? c.green('connected') : c.grey('no token')}`
            : c.grey('not configured'),
        ),
      );
      if (gh.configured) print(c.grey(`              ${gh.note}`));

      print();
      print(heading('Pricing'));
      print(
        ...renderTable(
          ['Plan', 'Price', 'Seats', 'Frameworks', 'Scans/month'],
          Object.entries(PRICING).map(([plan, p]) => [
            plan,
            p.monthly === 0 ? '€0' : `${formatEuro(p.monthly)}/mo`,
            String(p.seats),
            p.frameworks > 0 ? String(p.frameworks) : 'unlimited',
            p.scansPerMonth > 0 ? String(p.scansPerMonth) : 'unlimited',
          ]),
        ),
      );
      print();
    });

  return program;
}

function pathJoin(...parts: string[]): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const path = require('node:path') as typeof import('node:path');
  return path.join(...parts);
}

/** Entry point used by the bin script. */
export async function main(argv = process.argv): Promise<void> {
  const program = buildProgram();
  try {
    await program.parseAsync(argv);
  } catch (error) {
    printError((error as Error).message);
    process.exitCode = 1;
  }
}

export { buildProgram as createProgram };
export * from './workspace';
export * from './output';