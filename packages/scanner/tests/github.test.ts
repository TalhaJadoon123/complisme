import { describe, expect, it } from 'vitest';

import { findingsToIssues, gapToIssue, githubStatus, issueKey, parseRepo, publishIssues } from '../src/github';
import type { Finding, Gap } from '@complisme/shared';

const gap: Gap = {
  id: 'g1',
  frameworkId: 'gdpr',
  articleId: 'art-5-principles',
  questionId: 'a5-q1',
  title: 'No lawful basis recorded',
  description: 'Processing activity has no Art. 6 basis.',
  severity: 'error',
  remediation: 'Record a lawful basis per activity.',
  effort: 5,
  fineExposure: 20_000_000,
  deadlineIso: '2018-05-25',
  citation: 'Regulation (EU) 2016/679, Art. 5',
  source: 'rules',
  findings: [
    {
      id: 'f1',
      ruleId: 'pii/collection',
      category: 'pii-collection',
      severity: 'medium',
      message: 'Personal data collected',
      file: 'src/signup.ts',
      line: 12,
      confidence: 0.7,
      mappings: [{ frameworkId: 'gdpr', articleId: 'art-5-principles', reason: 'Art. 5(1)(a)' }],
    },
  ],
};

describe('parseRepo', () => {
  it('accepts owner/repo, URLs and a .git suffix', () => {
    expect(parseRepo('complisme/complisme')).toEqual({ owner: 'complisme', repo: 'complisme' });
    expect(parseRepo('https://github.com/acme/tools')).toEqual({ owner: 'acme', repo: 'tools' });
    expect(parseRepo('https://www.github.com/acme/tools.git')).toEqual({ owner: 'acme', repo: 'tools' });
    expect(parseRepo('acme/tools.git')).toEqual({ owner: 'acme', repo: 'tools' });
  });

  it('rejects malformed input and path tricks', () => {
    expect(parseRepo('')).toBeNull();
    expect(parseRepo('just-a-name')).toBeNull();
    expect(parseRepo('a/b/c')).toBeNull();
    expect(parseRepo('../../etc/passwd')).toBeNull();
    expect(parseRepo('owner/re po')).toBeNull();
  });
});

describe('issueKey', () => {
  it('is stable and discriminating', () => {
    expect(issueKey('gdpr', 'art-5-principles', 'a5-q1')).toBe(
      issueKey('gdpr', 'art-5-principles', 'a5-q1'),
    );
    expect(issueKey('gdpr', 'art-5-principles', 'a5-q1')).not.toBe(
      issueKey('eu-ai-act', 'art-5-principles', 'a5-q1'),
    );
  });
});

describe('gapToIssue', () => {
  it('renders a complete, actionable issue body', () => {
    const issue = gapToIssue(gap, { repoUrl: 'https://github.com/acme/tools' });
    expect(issue.title).toContain('No lawful basis recorded');
    expect(issue.body).toContain('20,000,000');
    expect(issue.body).toContain('Record a lawful basis');
    expect(issue.body).toContain('src/signup.ts:12');
    expect(issue.body).toContain(issueKey('gdpr', 'art-5-principles', 'a5-q1'));
    expect(issue.labels).toContain('compliance');
    expect(issue.labels).toContain('framework:gdpr');
    expect(issue.labels).toContain('severity:error');
  });

  it('honours a custom prefix and label set', () => {
    const issue = gapToIssue(gap, { prefix: '[DPA]', labels: ['compliance', 'onboarding'] });
    expect(issue.title.startsWith('[DPA]')).toBe(true);
    expect(issue.labels).toContain('onboarding');
  });

  it('omits the findings block when there is nothing to show', () => {
    const issue = gapToIssue({ ...gap, findings: [] });
    expect(issue.body).not.toContain('Code locations');
  });
});

describe('findingsToIssues', () => {
  const findings: Finding[] = [
    {
      id: 'a',
      ruleId: 'pii/collection',
      category: 'pii-collection',
      severity: 'medium',
      message: 'Personal data collected',
      file: 'src/a.ts',
      line: 1,
      confidence: 0.7,
      mappings: [{ frameworkId: 'gdpr', articleId: 'art-5-principles', reason: 'Art. 5' }],
    },
    {
      id: 'b',
      ruleId: 'pii/collection',
      category: 'pii-collection',
      severity: 'medium',
      message: 'Personal data collected',
      file: 'src/b.ts',
      line: 2,
      confidence: 0.7,
      mappings: [{ frameworkId: 'gdpr', articleId: 'art-5-principles', reason: 'Art. 5' }],
    },
    {
      id: 'c',
      ruleId: 'ai-act/api-call',
      category: 'ai-api-call',
      severity: 'info',
      message: 'AI model API call',
      file: 'src/c.ts',
      line: 3,
      confidence: 0.8,
      mappings: [{ frameworkId: 'eu-ai-act', articleId: 'art-6-classification', reason: 'Art. 6' }],
    },
  ];

  it('collapses the same rule across many files into one issue', () => {
    const issues = findingsToIssues(findings);
    expect(issues).toHaveLength(2);
    const pii = issues.find((i) => i.labels.includes('rule:pii'))!;
    expect(pii.body).toContain('src/a.ts:1');
    expect(pii.body).toContain('src/b.ts:2');
  });

  it('splits one rule across different articles', () => {
    const issues = findingsToIssues([
      {
        ...findings[0],
        mappings: [
          { frameworkId: 'gdpr', articleId: 'art-5-principles', reason: 'a' },
          { frameworkId: 'gdpr', articleId: 'art-30-ropa', reason: 'b' },
        ],
      },
    ]);
    expect(issues).toHaveLength(2);
  });

  it('returns nothing for no findings', () => {
    expect(findingsToIssues([])).toEqual([]);
  });
});

/** Stub fetch that records calls and returns programmable responses. */
function stubFetch(responses: Array<{ ok: boolean; body: unknown }>) {
  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  let index = 0;
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({
      url,
      method: init?.method ?? 'GET',
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const next = responses[Math.min(index, responses.length - 1)];
    index += 1;
    return {
      ok: next.ok,
      status: next.ok ? 200 : 403,
      async json() {
        return next.body;
      },
    } as Response;
  }) as typeof fetch;
  return { impl, calls };
}

describe('publishIssues', () => {
  const issue = gapToIssue(gap);

  it('refuses without a token and explains why', async () => {
    const result = await publishIssues([issue], { repo: 'acme/tools' });
    expect(result.published).toBe(false);
    expect(result.reason).toMatch(/GITHUB_TOKEN/);
    expect(result.created).toEqual([]);
  });

  it('refuses a malformed repository', async () => {
    const result = await publishIssues([issue], { repo: 'nonsense', token: 't' });
    expect(result.published).toBe(false);
    expect(result.reason).toMatch(/could not parse/);
  });

  it('honours the disabled flag', async () => {
    const result = await publishIssues([issue], { repo: 'acme/tools', token: 't', enabled: false });
    expect(result.published).toBe(false);
    expect(result.reason).toMatch(/disabled/);
  });

  it('creates an issue when no duplicate exists', async () => {
    const { impl, calls } = stubFetch([
      { ok: true, body: { total_count: 0 } },
      { ok: true, body: { number: 7, html_url: 'https://github.com/acme/tools/issues/7' } },
    ]);
    const result = await publishIssues([issue], { repo: 'acme/tools', token: 't' }, impl);

    expect(result.published).toBe(true);
    expect(result.created).toHaveLength(1);
    expect(result.created[0].number).toBe(7);
    expect(calls.some((c) => c.url.includes('/search/issues'))).toBe(true);
    expect(calls.some((c) => c.url.endsWith('/issues') && c.method === 'POST')).toBe(true);
  });

  it('skips an issue that already carries the same key', async () => {
    const { impl, calls } = stubFetch([{ ok: true, body: { total_count: 1 } }]);
    const result = await publishIssues([issue], { repo: 'acme/tools', token: 't' }, impl);

    expect(result.published).toBe(true);
    expect(result.created).toHaveLength(0);
    expect(result.skipped).toBe(1);
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });

  it('does not throw when GitHub is unreachable', async () => {
    const impl = (async () => {
      throw new Error('network down');
    }) as typeof fetch;
    const result = await publishIssues([issue], { repo: 'acme/tools', token: 't' }, impl);
    expect(result.published).toBe(true);
    expect(result.skipped).toBe(1);
  });

  it('counts a rejected create as skipped rather than throwing', async () => {
    const { impl } = stubFetch([
      { ok: true, body: { total_count: 0 } },
      { ok: false, body: { message: 'Forbidden' } },
    ]);
    const result = await publishIssues([issue], { repo: 'acme/tools', token: 't' }, impl);
    expect(result.created).toHaveLength(0);
    expect(result.skipped).toBe(1);
  });
});

describe('githubStatus', () => {
  it('reports an unconfigured repository', async () => {
    const status = await githubStatus({ repo: 'nonsense' });
    expect(status.configured).toBe(false);
  });

  it('reports a repository with no token as unauthenticated', async () => {
    const status = await githubStatus({ repo: 'acme/tools' });
    expect(status.configured).toBe(true);
    expect(status.authenticated).toBe(false);
    expect(status.note).toMatch(/stays local/);
  });

  it('reports a working token', async () => {
    const { impl } = stubFetch([{ ok: true, body: { full_name: 'acme/tools' } }]);
    const status = await githubStatus({ repo: 'acme/tools', token: 't' }, impl);
    expect(status.authenticated).toBe(true);
    expect(status.note).toMatch(/issues:write/);
  });

  it('reports a rejected token without throwing', async () => {
    const { impl } = stubFetch([{ ok: false, body: { message: 'Bad credentials' } }]);
    const status = await githubStatus({ repo: 'acme/tools', token: 'bad' }, impl);
    expect(status.authenticated).toBe(false);
    expect(status.note).toMatch(/rejected/);
  });
});