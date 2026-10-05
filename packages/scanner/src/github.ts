/**
 * GitHub integration.
 *
 * Publishes scan findings and compliance summaries back into the repository
 * that CompliSME is analysing, so a compliance gap becomes a visible,
 * assignable issue rather than a line in a terminal.
 *
 * Everything is opt-in and requires no token for public repositories: an
 * unauthenticated write is simply not attempted, and the module reports why.
 */

import { createHash } from 'node:crypto';

import type { Finding, Gap } from '@complisme/shared';

export interface GitHubConfig {
  token?: string;
  /** `owner/repo`, or the repository url. */
  repo: string;
  /** Where compliance issues are filed. Empty string means the repo root. */
  labels?: string[];
  /** Prefix used in issue titles so compliance issues are identifiable. */
  titlePrefix?: string;
  /** Set false to dry-run without touching GitHub. */
  enabled?: boolean;
  apiBaseUrl?: string;
}

export interface GitHubIssue {
  title: string;
  body: string;
  labels: string[];
}

export interface PublishResult {
  published: boolean;
  reason?: string;
  created: Array<{ number?: number; url?: string; title: string }>;
  skipped: number;
}

const DEFAULT_API = 'https://api.github.com';

/** Parse `owner/repo` or any github.com URL into its two parts. */
export function parseRepo(input: string): { owner: string; repo: string } | null {
  const trimmed = input.trim().replace(/\.git$/, '');
  const url = /^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/]+)/i.exec(trimmed);
  const parts = url ? [url[1], url[2]] : trimmed.split('/');
  if (parts.length !== 2) return null;
  const [owner, repo] = parts;
  if (!owner || !repo) return null;
  if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) return null;
  return { owner, repo: repo.replace(/\.git$/, '') };
}

/** Stable issue key so re-running does not duplicate issues. */
export function issueKey(frameworkId: string, articleId: string, category: string): string {
  return createHash('sha1')
    .update(`${frameworkId}:${articleId}:${category}`)
    .digest('hex')
    .slice(0, 16);
}

/** Build a GitHub issue from a compliance gap. */
export function gapToIssue(
  gap: Gap,
  options: { labels?: string[]; prefix?: string; repoUrl?: string } = {},
): GitHubIssue {
  const key = issueKey(gap.frameworkId, gap.articleId, gap.questionId ?? gap.title ?? 'general');
  const prefix = options.prefix ?? '[compliance]';

  const labels = new Set(options.labels ?? []);
  labels.add('compliance');
  labels.add(`framework:${gap.frameworkId}`);
  labels.add(`severity:${gap.severity}`);
  if (gap.source) labels.add(`source:${gap.source}`);

  const lines = [
    `Automated by CompliSME from \`complisme scan\` and the compliance engine.`,
    '',
    `**Issue key:** \`${key}\``,
    '',
    `| | |`,
    `|---|---|`,
    `| Framework | \`${gap.frameworkId}\` |`,
    `| Article | \`${gap.articleId}\` |`,
    `| Severity | **${gap.severity}** |`,
    `| Effort | ${gap.effort} person-days |`,
    gap.fineExposure ? `| Worst-case exposure | ${gap.fineExposure.toLocaleString('en-IE')} EUR |` : '',
    gap.deadlineIso ? `| Statutory deadline | ${gap.deadlineIso} |` : '',
    gap.source ? `| Detected by | ${gap.source} |` : '',
    gap.citation ? `| Citation | ${gap.citation} |` : '',
    '',
    '## What is wrong',
    gap.description ?? gap.title ?? 'Compliance gap identified.',
    '',
    '## What to do',
    gap.remediation,
  ].filter(Boolean);

  const findings = gap.findings ?? [];
  if (findings.length) {
    lines.push(
      '',
      `## Code locations (${findings.length})`,
      '',
      '<details><summary>First 25 locations</summary>',
      '',
      ...findings
        .slice(0, 25)
        .map((f) => `- \`${f.file}:${f.line}\` — ${f.message} _(confidence ${(f.confidence * 100).toFixed(0)}%)_`),
      '',
      '</details>',
    );
  }

  lines.push(
    '',
    '---',
    '',
    options.repoUrl
      ? `Raised by CompliSME · ${new Date().toISOString().slice(0, 10)}`
      : `Raised by CompliSME · ${new Date().toISOString().slice(0, 10)}`,
  );

  return { title: `${prefix} ${gap.title ?? gap.articleId}`, body: lines.join('\n'), labels: [...labels] };
}

/** Convert findings to issues without any HTTP call. */
export function findingsToIssues(
  findings: Finding[],
  options: { labels?: string[]; prefix?: string; repoUrl?: string } = {},
): GitHubIssue[] {
  const seen = new Set<string>();
  const issues: GitHubIssue[] = [];

  for (const finding of findings) {
    // One issue per (rule, article) pair: the same violation in 40 files is
    // one remediation task, not 40 issues.
    for (const mapping of finding.mappings) {
      const key = issueKey(mapping.frameworkId, mapping.articleId, finding.ruleId);
      if (seen.has(key)) continue;
      seen.add(key);

      const labels = new Set(options.labels ?? []);
      labels.add('compliance');
      labels.add(`framework:${mapping.frameworkId}`);
      labels.add(`rule:${finding.ruleId.split('/')[0]}`);

      const locations = findings
        .filter((f) => f.ruleId === finding.ruleId)
        .slice(0, 25)
        .map((f) => `- \`${f.file}:${f.line}\` — ${f.message}`);

      issues.push({
        title: `${options.prefix ?? '[compliance]'} ${finding.message}`,
        labels: [...labels],
        body: [
          'Automated by CompliSME from `complisme scan`.',
          '',
          `**Issue key:** \`${key}\``,
          '',
          '## Why this matters',
          mapping.reason,
          '',
          `**Article:** \`${mapping.frameworkId}/${mapping.articleId}\` · **Severity:** ${finding.severity} · **Confidence:** ${(finding.confidence * 100).toFixed(0)}%`,
          '',
          '## How to fix it',
          finding.remediation,
          '',
          '## Where',
          '',
          ...locations,
          '',
          '---',
          '',
          `Raised by CompliSME · ${new Date().toISOString().slice(0, 10)}`,
        ].join('\n'),
      });
    }
  }

  return issues;
}

/**
 * Create issues on GitHub.
 *
 * Requires a token with `issues: write`. Search-then-create is used so that
 * re-running the scan is idempotent: an existing issue with the same key is
 * left alone rather than duplicated.
 */
export async function publishIssues(
  issues: GitHubIssue[],
  config: GitHubConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<PublishResult> {
  if (config.enabled === false) {
    return { published: false, reason: 'disabled by configuration', created: [], skipped: issues.length };
  }
  const repo = parseRepo(config.repo);
  if (!repo) {
    return { published: false, reason: `could not parse repository "${config.repo}"`, created: [], skipped: issues.length };
  }
  if (!config.token) {
    return {
      published: false,
      reason:
        'GITHUB_TOKEN not set — issues were not created. Set it to a token with issues:write scope to enable this.',
      created: [],
      skipped: issues.length,
    };
  }

  const base = (config.apiBaseUrl ?? DEFAULT_API).replace(/\/+$/, '');
  const headers = {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${config.token}`,
    'content-type': 'application/json',
    'user-agent': 'complisme',
    'x-github-api-version': '2022-11-28',
  };

  const created: PublishResult['created'] = [];
  let skipped = 0;

  for (const issue of issues) {
    const keyMatch = /\*\*Issue key:\*\*\s*`([a-f0-9]+)`/.exec(issue.body);

    // Idempotency: skip when an issue carrying this key already exists.
    if (keyMatch) {
      const query = encodeURIComponent(`"${keyMatch[1]}" in:body repo:${repo.owner}/${repo.repo}`);
      try {
        const search = await fetchImpl(`${base}/search/issues?q=${query}`, { headers });
        if (search.ok) {
          const body = (await search.json()) as { total_count?: number };
          if ((body.total_count ?? 0) > 0) {
            skipped += 1;
            continue;
          }
        }
      } catch {
        // A failed search must not block creating the issue; fall through.
      }
    }

    try {
      const response = await fetchImpl(`${base}/repos/${repo.owner}/${repo.repo}/issues`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ title: issue.title, body: issue.body, labels: issue.labels }),
      });
      if (!response.ok) {
        skipped += 1;
        continue;
      }
      const body = (await response.json()) as { number?: number; html_url?: string };
      created.push({ number: body.number, url: body.html_url, title: issue.title });
    } catch {
      skipped += 1;
    }
  }

  return { published: true, created, skipped };
}

/** Status block for `complisme status-all`. */
export async function githubStatus(
  config: GitHubConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<{ configured: boolean; repo: string | null; authenticated: boolean; note: string }> {
  const repo = parseRepo(config.repo);
  if (!repo) return { configured: false, repo: null, authenticated: false, note: 'Set GITHUB_REPO=owner/repo.' };
  if (!config.token) {
    return {
      configured: true,
      repo: `${repo.owner}/${repo.repo}`,
      authenticated: false,
      note: 'Repository set but no GITHUB_TOKEN — scanning stays local and no issues are filed.',
    };
  }
  try {
    const response = await fetchImpl(
      `${(config.apiBaseUrl ?? DEFAULT_API).replace(/\/+$/, '')}/repos/${repo.owner}/${repo.repo}`,
      {
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${config.token}`,
          'user-agent': 'complisme',
          'x-github-api-version': '2022-11-28',
        },
      },
    );
    if (!response.ok) {
      return {
        configured: true,
        repo: `${repo.owner}/${repo.repo}`,
        authenticated: false,
        note: `GitHub rejected the token (HTTP ${response.status}).`,
      };
    }
    return {
      configured: true,
      repo: `${repo.owner}/${repo.repo}`,
      authenticated: true,
      note: 'Connected. `complisme publish` can file compliance issues with issues:write scope.',
    };
  } catch (error) {
    return {
      configured: true,
      repo: `${repo.owner}/${repo.repo}`,
      authenticated: false,
      note: `Could not reach GitHub: ${(error as Error).message}`,
    };
  }
}
