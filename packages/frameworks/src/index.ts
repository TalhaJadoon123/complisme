/**
 * Framework registry.
 *
 * Definitions live as YAML so that they can be reviewed, diffed and edited by
 * non-developers (and by customers who want to run their own fork of CompliSME).
 * This module is the only place that reads them: it validates each file against
 * the shared Zod schema, caches the result and exposes lookup helpers.
 */

import fs from 'node:fs';
import path from 'node:path';

import YAML from 'yaml';

import {
  FRAMEWORK_ORDER,
  aiSystemSchema,
  articleSchema,
  frameworkSchema,
  questionSchema,
} from '@complisme/shared';
import type {
  Article,
  Framework,
  FrameworkId,
  Question,
  QuestionOption,
} from '@complisme/shared';

/** Thrown when a YAML definition is missing or malformed. */
export class FrameworkDefinitionError extends Error {
  constructor(
    message: string,
    readonly file?: string,
  ) {
    super(message);
    this.name = 'FrameworkDefinitionError';
  }
}

let cache: Map<string, Framework> | null = null;

/** Locate the `definitions` directory for both `src` and `dist` execution. */
export function definitionsDir(): string {
  const candidates = [
    path.resolve(__dirname, 'definitions'),
    path.resolve(__dirname, '..', 'definitions'),
    path.resolve(__dirname, '..', '..', 'definitions'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) return dir;
  }
  throw new FrameworkDefinitionError(
    `framework definitions directory not found (looked in: ${candidates.join(', ')})`,
  );
}

export function definitionsPath(id: FrameworkId): string {
  const dir = definitionsDir();
  const direct = path.join(dir, `${id}.yaml`);
  if (fs.existsSync(direct)) return direct;
  const fallback = path.join(dir, `${id}.yml`);
  if (fs.existsSync(fallback)) return fallback;
  throw new FrameworkDefinitionError(`no definition file for framework "${id}"`, dir);
}

/** Parse and validate a single definition file. */
export function loadFramework(id: FrameworkId): Framework {
  const file = definitionsPath(id);
  const raw = fs.readFileSync(file, 'utf8');
  let parsed: unknown;
  try {
    parsed = YAML.parse(raw);
  } catch (error) {
    throw new FrameworkDefinitionError(
      `invalid YAML in ${path.basename(file)}: ${(error as Error).message}`,
      file,
    );
  }
  const result = frameworkSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 8)
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new FrameworkDefinitionError(
      `invalid framework definition ${path.basename(file)} — ${issues}`,
      file,
    );
  }
  const framework = result.data as Framework;
  if (framework.id !== id) {
    throw new FrameworkDefinitionError(
      `framework id mismatch: file ${path.basename(file)} declares id "${framework.id}"`,
      file,
    );
  }
  return normalise(framework);
}

function normalise(framework: Framework): Framework {
  const seenArticles = new Set<string>();
  const articles: Article[] = [];
  for (const article of framework.articles) {
    if (seenArticles.has(article.id)) {
      throw new FrameworkDefinitionError(
        `duplicate article id "${article.id}" in ${framework.id}`,
      );
    }
    seenArticles.add(article.id);
    const seenQuestions = new Set<string>();
    const questionnaire: Question[] = [];
    for (const question of article.questionnaire) {
      if (seenQuestions.has(question.id)) {
        throw new FrameworkDefinitionError(
          `duplicate question id "${question.id}" in ${framework.id}/${article.id}`,
        );
      }
      seenQuestions.add(question.id);
      questionnaire.push({
        ...question,
        weight: question.weight ?? 1,
        effort: question.effort ?? 3,
        remediation: question.remediation ?? `Implement the requirements of ${article.title}.`,
        options: normaliseOptions(question),
      } as Question);
    }
    articles.push({
      ...article,
      weight: article.weight ?? 1,
      evidenceRequired: article.evidenceRequired ?? [],
      questionnaire,
    } as Article);
  }
  return {
    ...framework,
    smeApplicable: framework.smeApplicable ?? true,
    articles,
  };
}

function normaliseOptions(question: Question): QuestionOption[] | undefined {
  if (question.options && question.options.length) {
    return question.options.map((option) => ({
      ...option,
      satisfies: option.satisfies ?? !option.notApplicable,
    }));
  }
  if (question.type === 'boolean' || question.type === 'single') {
    return [
      { value: 'yes', label: 'Yes', satisfies: true },
      { value: 'no', label: 'No', satisfies: false },
      { value: 'n/a', label: 'Not applicable', notApplicable: true },
    ];
  }
  return undefined;
}

/** All bundled frameworks, cached. */
export function listFrameworks(): Framework[] {
  if (cache) return [...cache.values()];
  const map = new Map<string, Framework>();
  const dir = definitionsDir();
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.yaml') && !file.endsWith('.yml')) continue;
    const id = file.replace(/\.ya?ml$/, '');
    map.set(id, loadFramework(id));
  }
  // Deterministic order: canonical order first, then any extra definition.
  const extras = [...map.keys()]
    .filter((id) => !FRAMEWORK_ORDER.includes(id as never))
    .sort();
  const ordered = [...FRAMEWORK_ORDER.map((id) => id as string), ...extras];
  const built = new Map<string, Framework>();
  for (const id of ordered) {
    const framework = map.get(id);
    if (framework) built.set(id, framework);
  }
  cache = built;
  return [...built.values()];
}

export function getFramework(id: FrameworkId): Framework {
  const framework = listFrameworks().find((f) => f.id === id);
  if (!framework) {
    throw new FrameworkDefinitionError(
      `unknown framework "${id}" — available: ${listFrameworks()
        .map((f) => f.id)
        .join(', ')}`,
    );
  }
  return framework;
}

export function hasFramework(id: string): boolean {
  try {
    getFramework(id);
    return true;
  } catch {
    return false;
  }
}

export function getArticle(
  frameworkId: FrameworkId,
  articleId: string,
): { framework: Framework; article: Article } | undefined {
  const framework = getFramework(frameworkId);
  const article = framework.articles.find((a) => a.id === articleId);
  return article ? { framework, article } : undefined;
}

export function getQuestion(
  frameworkId: FrameworkId,
  articleId: string,
  questionId: string,
): { framework: Framework; article: Article; question: Question } | undefined {
  const found = getArticle(frameworkId, articleId);
  if (!found) return undefined;
  const question = found.article.questionnaire.find((q) => q.id === questionId);
  return question ? { ...found, question } : undefined;
}

/**
 * Flat index of every question, keyed by `"<frameworkId>:<questionId>"`.
 * Question ids are unique per framework but repeat across frameworks on purpose
 * (e.g. `a5-q1`), so the compound key avoids collisions.
 */
export function questionIndex(): Map<
  string,
  { frameworkId: string; article: Article; question: Question }
> {
  const index = new Map<string, { frameworkId: string; article: Article; question: Question }>();
  for (const framework of listFrameworks()) {
    for (const article of framework.articles) {
      for (const question of article.questionnaire) {
        index.set(`${framework.id}:${question.id}`, {
          frameworkId: framework.id,
          article,
          question,
        });
      }
    }
  }
  return index;
}

export function questionKey(frameworkId: FrameworkId, questionId: string): string {
  return `${frameworkId}:${questionId}`;
}

/** Total number of questions per framework — used by the dashboard progress bar. */
export function frameworkStats(): Array<{
  id: string;
  name: string;
  articles: number;
  questions: number;
  evidenceItems: number;
  fineExposure: number;
}> {
  return listFrameworks().map((framework) => ({
    id: framework.id,
    name: framework.name,
    articles: framework.articles.length,
    questions: framework.articles.reduce((acc, a) => acc + a.questionnaire.length, 0),
    evidenceItems: framework.articles.reduce((acc, a) => acc + a.evidenceRequired.length, 0),
    fineExposure: framework.articles.reduce((acc, a) => acc + (a.fineExposure ?? 0), 0),
  }));
}

/** Sum of the fine exposure of the articles a company is in scope for. */
export function totalFineExposure(frameworkIds: FrameworkId[]): number {
  return frameworkIds.reduce((acc, id) => {
    try {
      const framework = getFramework(id);
      return acc + framework.articles.reduce((a, article) => a + (article.fineExposure ?? 0), 0);
    } catch {
      return acc;
    }
  }, 0);
}

/** Allow tests and the CLI to work with an explicit registry. */
export function registerFramework(framework: Framework): void {
  const parsed = frameworkSchema.parse(framework);
  if (!cache) listFrameworks();
  cache!.set(parsed.id, normalise(parsed as Framework));
}

export function clearRegistryCache(): void {
  cache = null;
}

export { articleSchema, questionSchema, aiSystemSchema, frameworkSchema };
export type { Article, Framework, Question, QuestionOption };

export * from './applicability';
export * from './fines';