/**
 * `complisme publish` — file compliance gaps as GitHub issues.
 *
 * Kept separate from index.ts because it is the only command that performs
 * outbound writes, and outbound writes deserve their own module with their own
 * guard rails: nothing is sent without an explicit repository and a token, and
 * a dry run prints exactly what would be created.
 */

import { ComplianceEngine } from '@complisme/core';
import {
  CodeScanner,
  findingsToIssues,
  gapToIssue,
  githubStatus,
  publishIssues,
} from '@complisme/scanner';
import type { Command } from 'commander';

import { c, print, printError, printJson } from '../output';
import { appendHistory, loadAnswers, loadProfile, type Workspace } from '../workspace';
import type { GlobalOptions } from '../global-options';

export interface PublishOptions {
  repo?: string;
  scan?: string;
  dryRun?: boolean;
  titlePrefix?: string;
  limit?: number;
  profile?: string;
}

export function registerPublishCommand(program: Command, workspaceFor: (o: GlobalOptions) => Workspace): void {
  program
    .command('publish')
    .description('file compliance gaps and scanner findings as GitHub issues')
    .option('--repo <owner/repo>', 'target repository (defaults to $GITHUB_REPOSITORY)')
    .option('--scan <path>', 'also scan this codebase and publish its findings')
    .option('--dry-run', 'print the issues without creating them')
    .option('--title-prefix <prefix>', 'issue title prefix', '[compliance]')
    .option('--limit <n>', 'maximum issues to create', (v) => Number(v), 25)
    .action(async (options: PublishOptions) => {
      const globals = program.opts<GlobalOptions>();
      const workspace = workspaceFor(globals);
      const repo = options.repo ?? process.env.GITHUB_REPOSITORY;

      if (!repo) {
        printError('No repository specified. Use --repo owner/repo or set GITHUB_REPOSITORY.');
        process.exitCode = 1;
        return;
      }

      const limit = Math.max(1, Math.min(options.limit ?? 25, 100));
      const issues: Array<{ title: string; body: string; labels: string[] }> = [];

      // Gaps from the local assessment, unless we are scanning instead.
      if (!options.scan) {
        const profile = loadProfile(workspace) ?? (options.profile ? loadProfile(workspace) : undefined);
        if (profile) {
          const plan = new ComplianceEngine().plan(profile, loadAnswers(workspace));
          for (const gap of plan.gaps.slice(0, limit)) {
            issues.push(gapToIssue(gap, { prefix: options.titlePrefix }));
          }
        }
      }

      if (options.scan) {
        const scan = await new CodeScanner().scan({ root: options.scan });
        issues.push(
          ...findingsToIssues(scan.findings, { prefix: options.titlePrefix }).slice(0, limit),
        );
      }

      const config = {
        repo,
        token: process.env.GITHUB_TOKEN,
        titlePrefix: options.titlePrefix,
        enabled: !options.dryRun,
      };

      if (globals.json) {
        printJson({ repo, dryRun: !!options.dryRun, count: issues.length, issues });
        return;
      }

      if (options.dryRun) {
        print();
        print(c.bold(`  ${issues.length} issue(s) would be created in ${repo}`));
        for (const issue of issues.slice(0, 15)) print(c.grey(`    ${issue.title}`));
        if (issues.length > 15) print(c.grey(`    … ${issues.length - 15} more`));
        print(c.grey('  Nothing was sent. Drop --dry-run to create them.'));
        print();
        return;
      }

      const result = await publishIssues(issues, config);
      appendHistory(workspace, 'publish', `${repo}: ${result.created.length} created`);

      if (!result.published) {
        printError(result.reason ?? 'Publishing failed.');
        process.exitCode = 1;
        return;
      }

      print();
      print(c.boldGreen(`  ${result.created.length} issue(s) created in ${repo}`));
      for (const issue of result.created) {
        print(`    #${issue.number}  ${c.grey(issue.url ?? '')}  ${issue.title}`);
      }
      if (result.skipped) {
        print(c.grey(`  ${result.skipped} skipped (already present, or rejected by GitHub)`));
      }
      print();
    });
}

/** GitHub connection status, surfaced by `status-all`. */
export async function publishStatus(): Promise<ReturnType<typeof githubStatus>> {
  return githubStatus({ repo: process.env.GITHUB_REPOSITORY ?? '', token: process.env.GITHUB_TOKEN });
}
