#!/usr/bin/env node
/**
 * `complisme-desktop` — launch the GUI.
 *
 * Starts a local server bound to 127.0.0.1, prints the URL, and opens the
 * default browser. Closing the terminal, or Ctrl+C, stops it.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { nowIso } from '@complisme/shared';

import { startDesktop, type DesktopOptions } from './app';

export interface LaunchOptions extends Partial<DesktopOptions> {
  /** Skip opening a browser. */
  noOpen?: boolean;
  /** Print JSON instead of a human summary. */
  json?: boolean;
}

export function defaultWorkspace(): string {
  return path.join(os.homedir(), '.complisme');
}

/** Best-effort open in the default browser. */
function openBrowser(url: string): void {
  const command =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  try {
    const child = spawn(command, [url], { stdio: 'ignore', detached: true, shell: process.platform === 'win32' });
    child.on('error', () => {
      /* no browser available; the printed URL still works */
    });
    child.unref();
  } catch {
    /* ignore */
  }
}

export async function launch(options: LaunchOptions = {}): Promise<{ url: string; close: () => Promise<void> }> {
  const workspaceDir = options.workspaceDir ?? process.env.COMPLISME_HOME ?? defaultWorkspace();
  fs.mkdirSync(workspaceDir, { recursive: true });

  const desktop = await startDesktop({
    port: options.port ?? Number(process.env.COMPLISME_PORT ?? 4317),
    host: options.host ?? '127.0.0.1',
    workspaceDir,
    scanRoot: options.scanRoot ?? process.cwd(),
    open: options.open,
  });

  if (!options.noOpen) openBrowser(desktop.url);

  if (options.json) {
    process.stdout.write(`${JSON.stringify({ url: desktop.url, workspace: workspaceDir })}\n`);
  } else {
    const line = '─'.repeat(56);
    process.stdout.write(
      `\n  CompliSME desktop\n  ${line}\n` +
        `  URL       ${desktop.url}\n` +
        `  Workspace ${workspaceDir}\n` +
        `  Scanning  ${options.scanRoot ?? process.cwd()}\n` +
        `  Started   ${nowIso()}\n` +
        `  ${line}\n` +
        `  Press Ctrl+C to stop.\n\n`,
    );
  }

  return desktop;
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const readFlag = (name: string): string | undefined => {
    const index = argv.indexOf(name);
    return index === -1 ? undefined : argv[index + 1];
  };

  launch({
    port: readFlag('--port') ? Number(readFlag('--port')) : undefined,
    workspaceDir: readFlag('--workspace'),
    scanRoot: readFlag('--scan-root'),
    noOpen: argv.includes('--no-open'),
    json: argv.includes('--json'),
  }).catch((error: Error) => {
    process.stderr.write(`failed to start: ${error.message}\n`);
    process.exit(1);
  });
}
