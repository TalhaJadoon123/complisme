/**
 * Local workspace state.
 *
 * The CLI works without a server: a company profile, its answers, evidence and
 * generated documents live in `.complisme/` in the project directory (or
 * `~/.complisme` with `--global`). The format is deliberately plain JSON so a
 * user can inspect, diff and commit it.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { nowIso, safeJsonParse, uuid } from '@complisme/shared';
import type {
  Answers,
  Assessment,
  CompanyProfile,
  DocumentKind,
  Evidence,
  GeneratedDocument,
  Gap,
  Roadmap,
} from '@complisme/shared';

export const STATE_DIR_NAME = '.complisme';

export interface Workspace {
  dir: string;
  profilePath: string;
  answersPath: string;
  evidencePath: string;
  documentsPath: string;
  assessmentsPath: string;
  reportsPath: string;
}

export function resolveWorkspace(options: { dir?: string; global?: boolean } = {}): Workspace {
  const base = options.global
    ? path.join(os.homedir(), STATE_DIR_NAME)
    : path.resolve(options.dir ?? process.cwd(), STATE_DIR_NAME);
  return {
    dir: base,
    profilePath: path.join(base, 'profile.json'),
    answersPath: path.join(base, 'answers.json'),
    evidencePath: path.join(base, 'evidence.json'),
    documentsPath: path.join(base, 'documents.json'),
    assessmentsPath: path.join(base, 'assessments.json'),
    reportsPath: path.join(base, 'reports'),
  };
}

export function ensureWorkspace(workspace: Workspace): Workspace {
  fs.mkdirSync(workspace.dir, { recursive: true });
  fs.mkdirSync(workspace.reportsPath, { recursive: true });
  return workspace;
}

function readJson<T>(file: string, fallback: T): T {
  if (!fs.existsSync(file)) return fallback;
  try {
    return safeJsonParse<T>(fs.readFileSync(file, 'utf8'), fallback);
  } catch {
    return fallback;
  }
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export function loadProfile(workspace: Workspace): CompanyProfile | undefined {
  return readJson<CompanyProfile | undefined>(workspace.profilePath, undefined);
}

export function saveProfile(workspace: Workspace, profile: CompanyProfile): CompanyProfile {
  const next = { ...profile, id: profile.id || uuid(), updatedAt: nowIso(), createdAt: profile.createdAt ?? nowIso() };
  writeJson(workspace.profilePath, next);
  return next;
}

export function requireProfile(workspace: Workspace): CompanyProfile {
  const profile = loadProfile(workspace);
  if (!profile) {
    throw new Error(
      `No company profile found at ${workspace.profilePath}. Run \`complisme init\` first, or pass --profile <file.json>.`,
    );
  }
  return profile;
}

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

export function loadAnswers(workspace: Workspace): Answers {
  return readJson<Answers>(workspace.answersPath, {});
}

export function saveAnswers(workspace: Workspace, answers: Answers): Answers {
  writeJson(workspace.answersPath, answers);
  return answers;
}

export function setAnswers(
  workspace: Workspace,
  updates: Array<{ frameworkId: string; questionId: string; value: string | number | boolean | string[] | null }>,
): Answers {
  const answers = loadAnswers(workspace);
  for (const update of updates) {
    const framework = (answers[update.frameworkId] ??= {});
    framework[update.questionId] = update.value;
  }
  return saveAnswers(workspace, answers);
}

/** Parse `gdpr.a5-q1=documented gdpr.a6-q1=yes eu-ai-act.a4-q1=none` style arguments. */
export function parseAnswerArgs(args: string[]): Array<{
  frameworkId: string;
  questionId: string;
  value: string | number | boolean | string[] | null;
}> {
  return args.map((arg) => {
    const index = arg.indexOf('=');
    if (index === -1) {
      throw new Error(`invalid answer "${arg}" — expected framework.question=value, e.g. gdpr.a5-q1=documented`);
    }
    const key = arg.slice(0, index).trim();
    const raw = arg.slice(index + 1);
    const dot = key.indexOf('.');
    if (dot === -1) {
      throw new Error(`invalid answer key "${key}" — expected framework.question, e.g. gdpr.a5-q1`);
    }
    return {
      frameworkId: key.slice(0, dot).trim(),
      questionId: key.slice(dot + 1).trim(),
      value: parseValue(raw),
    };
  });
}

export function parseValue(raw: string): string | number | boolean | string[] | null {
  const value = raw.trim();
  if (value === '') return null;
  if (value === 'null') return null;
  if (value === 'true' || value === 'yes') return true;
  if (value === 'false' || value === 'no') return false;
  if (value.startsWith('[') && value.endsWith(']')) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      return value
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}

// ---------------------------------------------------------------------------
// Evidence & documents
// ---------------------------------------------------------------------------

export function loadEvidence(workspace: Workspace): Evidence[] {
  return readJson<Evidence[]>(workspace.evidencePath, []);
}

export function saveEvidence(workspace: Workspace, evidence: Evidence[]): Evidence[] {
  writeJson(workspace.evidencePath, evidence);
  return evidence;
}

export function addEvidence(
  workspace: Workspace,
  evidence: Omit<Evidence, 'id' | 'collectedAt'> & { id?: string; collectedAt?: string },
): Evidence {
  const list = loadEvidence(workspace);
  const item: Evidence = { ...evidence, id: evidence.id ?? uuid(), collectedAt: evidence.collectedAt ?? nowIso() };
  list.push(item);
  saveEvidence(workspace, list);
  return item;
}

export function loadDocuments(workspace: Workspace): GeneratedDocument[] {
  return readJson<GeneratedDocument[]>(workspace.documentsPath, []);
}

export function saveDocuments(workspace: Workspace, documents: GeneratedDocument[]): GeneratedDocument[] {
  writeJson(workspace.documentsPath, documents);
  return documents;
}

export function recordDocument(
  workspace: Workspace,
  document: Omit<GeneratedDocument, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
): GeneratedDocument {
  const list = loadDocuments(workspace);
  const existing = list.find((d) => d.kind === document.kind && d.companyId === document.companyId);
  const version = (existing?.versions?.length ?? 0) + 1;
  const entry: GeneratedDocument = {
    ...document,
    id: document.id ?? existing?.id ?? uuid(),
    createdAt: existing?.createdAt ?? nowIso(),
    updatedAt: nowIso(),
    versions: [
      ...(existing?.versions ?? []),
      {
        version,
        createdAt: nowIso(),
        createdBy: 'cli',
        changeLog: `Generated ${document.format.toUpperCase()}`,
        checksum: document.checksum,
      },
    ],
  };
  const index = list.findIndex((d) => d.id === entry.id);
  if (index === -1) list.push(entry);
  else list[index] = entry;
  saveDocuments(workspace, list);
  return entry;
}

// ---------------------------------------------------------------------------
// Assessments (history)
// ---------------------------------------------------------------------------

export function loadAssessments(workspace: Workspace): Assessment[] {
  return readJson<Assessment[]>(workspace.assessmentsPath, []);
}

export function recordAssessment(
  workspace: Workspace,
  assessment: Omit<Assessment, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
): Assessment {
  const list = loadAssessments(workspace);
  const entry: Assessment = {
    ...assessment,
    id: assessment.id ?? uuid(),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  // Keep the 20 most recent.
  list.unshift(entry);
  saveJson(workspace, list.slice(0, 20));
  return entry;
}

function saveJson(workspace: Workspace, list: Assessment[]): void {
  writeJson(workspace.assessmentsPath, list);
}

/** Where generated artefacts are written by default. */
export function outputDir(workspace: Workspace, override?: string): string {
  const dir = override ? path.resolve(override) : path.join(workspace.reportsPath);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export interface HistoryEntry {
  at: string;
  command: string;
  detail?: string;
}

/** Append to the local history log shown by `complisme status`. */
export function appendHistory(workspace: Workspace, command: string, detail?: string): void {
  const file = path.join(workspace.dir, 'history.json');
  const list = readJson<HistoryEntry[]>(file, []);
  list.unshift({ at: nowIso(), command, detail });
  writeJson(file, list.slice(0, 50));
}

export function loadHistory(workspace: Workspace): HistoryEntry[] {
  return readJson<HistoryEntry[]>(path.join(workspace.dir, 'history.json'), []);
}

export type { CompanyProfile, Answers, Evidence, GeneratedDocument, Assessment, DocumentKind, Gap, Roadmap };