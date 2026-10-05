/**
 * Interactive prompts.
 *
 * Deliberately minimal: a readline-based question flow with sensible defaults,
 * so `complisme init` works in a terminal without pulling in a UI dependency.
 * Every prompt is skipped when `--yes` is passed or stdin is not a TTY.
 */

import readline from 'node:readline';

import { deriveSize } from '@complisme/core';
import { DEFAULT_BRANDING, formatEuro, stableId, uuid } from '@complisme/shared';
import type { Answers, CompanyProfile, DataSubjectCategory, FrameworkId } from '@complisme/shared';

import { c, print } from './output';

export interface Prompt {
  ask(question: string, opts?: { defaultValue?: string; choices?: string[]; hint?: string }): Promise<string>;
  confirm(question: string, defaultValue?: boolean): Promise<boolean>;
  close(): void;
}

export function createPrompt(): Prompt {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const ask = (question: string, opts: { defaultValue?: string; choices?: string[]; hint?: string } = {}) =>
    new Promise<string>((resolve) => {
      const hint = opts.hint ? c.grey(` (${opts.hint})`) : '';
      const choices = opts.choices ? c.grey(` [${opts.choices.join(' / ')}]`) : '';
      const def = opts.defaultValue !== undefined ? c.grey(` (${opts.defaultValue})`) : '';
      rl.question(`  ${question}${hint}${choices}${def} `, (answer) => {
        const value = answer.trim();
        resolve(value || opts.defaultValue || '');
      });
    });

  const confirm = (question: string, defaultValue = false) =>
    new Promise<boolean>((resolve) => {
      rl.question(`  ${question} ${c.grey(defaultValue ? '(Y/n)' : '(y/N)')} `, (answer) => {
        const value = answer.trim().toLowerCase();
        if (!value) resolve(defaultValue);
        else resolve(value === 'y' || value === 'yes');
      });
    });

  return { ask, confirm, close: () => rl.close() };
}

export function interactive(): boolean {
  return process.stdin.isTTY === true && process.env.CI !== 'true';
}

/** Guided company setup. */
export async function promptForProfile(existing?: CompanyProfile): Promise<CompanyProfile> {
  const prompt = createPrompt();
  try {
    print('');
    print(c.bold('  Tell us about your company'));
    print(c.grey('  Press enter to accept the value in brackets.\n'));

    const name = await prompt.ask('Legal name', { defaultValue: existing?.legalName ?? existing?.name ?? 'My Company BV' });
    const country = await prompt.ask('Country (ISO code)', { defaultValue: existing?.country ?? 'NL', hint: 'NL, DE, BR…' });
    const sector = await prompt.ask('Sector', {
      defaultValue: existing?.sector ?? 'software',
      choices: ['software', 'manufacturing', 'consulting', 'ecommerce', 'finance', 'healthcare', 'other'],
    });
    const employees = Number(
      (await prompt.ask('Employees', { defaultValue: String(existing?.employees ?? 10) })).replace(/\D/g, ''),
    );
    const revenue = Number(
      (await prompt.ask('Annual turnover (EUR)', { defaultValue: String(existing?.revenueEUR ?? 500_000) })).replace(/\D/g, ''),
    );

    const hasAi = await prompt.confirm('Do you use or build AI systems (including chatbots)?', (existing?.aiSystems?.length ?? 0) > 0);
    let domain = 'customer-service';
    if (hasAi) {
      domain = await prompt.ask('  Primary AI domain', {
        defaultValue: existing?.aiSystems?.[0]?.domain ?? 'customer-service',
        choices: ['customer-service', 'employment', 'education', 'credit', 'marketing', 'safety-component', 'internal'],
      });
    }

    const hasPersonalData = await prompt.confirm('Do you collect personal data (customers, employees…)?', existing?.processingActivities?.length !== 0);
    const usesCookies = await prompt.confirm('Do you use cookies or tracking on your website?', !!existing?.usesCookies);
    const hasRopa = await prompt.confirm('Do you already keep a record of processing activities?', !!existing?.hasRopa);
    const hasDpo = await prompt.confirm('Do you have a data protection officer?', !!existing?.hasDpo);

    const base: CompanyProfile = {
      id: existing?.id ?? stableId('company', name, country),
      name: name || (existing?.name ?? 'My Company'),
      legalName: name || (existing?.legalName ?? 'My Company'),
      country: (country || 'NL').toUpperCase().slice(0, 2),
      sector: sector || 'software',
      employees: Number.isFinite(employees) ? employees : 10,
      revenueEUR: Number.isFinite(revenue) ? revenue : 500_000,
      size: existing?.size ?? 'micro',
      aiSystems: hasAi
        ? [
            existing?.aiSystems?.[0] ?? {
              id: uuid(),
              name: 'AI system',
              purpose: 'To be described',
              domain,
              deployed: false,
            },
          ]
        : [],
      processingActivities: hasPersonalData
        ? existing?.processingActivities ?? [
            {
              id: uuid(),
              name: 'Customer administration',
              purpose: 'Contract administration, invoicing and support',
              legalBasis: 'contract',
              specialCategory: false,
              dataSubjects: ['customers'] as DataSubjectCategory[],
              dataCategories: ['name', 'email'],
              retentionMonths: 120,
            },
          ]
        : [],
      hasRopa,
      hasDpo,
      hasDpia: existing?.hasDpia ?? false,
      hasSecurityPolicies: existing?.hasSecurityPolicies ?? false,
      hasIncidentResponse: existing?.hasIncidentResponse ?? false,
      hasConsentMechanism: existing?.hasConsentMechanism ?? false,
      usesCookies,
      hostsDataInEu: existing?.hostsDataInEu ?? true,
      notes: existing?.notes,
      createdAt: existing?.createdAt,
    };

    base.size = deriveSize(base.employees, base.revenueEUR);
    print('');
    print(
      c.green(
        `  Saved ${base.legalName} — ${base.employees} employees, ${formatEuro(base.revenueEUR)} turnover, ${base.size} size.`,
      ),
    );
    return base;
  } finally {
    prompt.close();
  }
}

/** Guided questionnaire. Asks every question of the chosen frameworks. */
export async function promptForAnswers(
  profile: CompanyProfile,
  existing: Answers,
  frameworkId?: string,
): Promise<Array<{ frameworkId: string; questionId: string; value: string | number | boolean | string[] | null }>> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getFramework } = require('@complisme/frameworks') as typeof import('@complisme/frameworks');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { selectedFrameworks } = require('@complisme/frameworks') as typeof import('@complisme/frameworks');

  const ids: FrameworkId[] = frameworkId ? [frameworkId] : selectedFrameworks(profile);
  const updates: Array<{ frameworkId: string; questionId: string; value: string | number | boolean | string[] | null }> = [];
  const prompt = createPrompt();

  try {
    for (const id of ids) {
      let framework;
      try {
        framework = getFramework(id);
      } catch {
        continue;
      }
      print('');
      print(c.boldCyan(`  ${framework.shortName ?? framework.name}`));
      for (const article of framework.articles) {
        print('');
        print(c.bold(`    ${article.title}`));
        for (const question of article.questionnaire) {
          const current = existing[id]?.[question.id];
          if (question.type === 'boolean') {
            const answer = await prompt.confirm(`      ${question.text}`, current === true || current === 'yes');
            updates.push({ frameworkId: id, questionId: question.id, value: answer });
            continue;
          }
          const options = question.options ?? [];
          const labels = options.map((o, index) => `${index + 1}=${o.label}`);
          const answer = await prompt.ask(
            `      ${question.text}`,
        {
          defaultValue: current !== undefined && current !== null ? String(current) : '',
          choices: labels.length ? labels : undefined,
          hint: options.length ? undefined : 'free text',
        },
          );
          const numeric = Number(answer);
          const chosen =
            /^\d+$/.test(answer) && Number.isFinite(numeric) ? options[numeric - 1]?.value ?? answer : answer;
          updates.push({ frameworkId: id, questionId: question.id, value: chosen });
        }
      }
    }
  } finally {
    prompt.close();
  }

  return updates;
}

/** Yes/no confirmation for destructive steps. */
export async function promptConfirm(question: string, defaultValue = false): Promise<boolean> {
  if (!interactive()) return defaultValue;
  const prompt = createPrompt();
  try {
    return await prompt.confirm(question, defaultValue);
  } finally {
    prompt.close();
  }
}

export { DEFAULT_BRANDING };