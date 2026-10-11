import fs from 'node:fs';
import path from 'node:path';

import { ComplianceEngine } from '@complisme/core';
import { acme, acmeColdStartAnswers } from '@complisme/core';

import { DocumentGenerator } from '../src/index';

const engine = new ComplianceEngine();
const plan = engine.plan(acme, acmeColdStartAnswers);
const generator = new DocumentGenerator();
const outDir = path.resolve(__dirname, '..', '.tmp');

const kinds = [
  'gdpr-ropa',
  'gdpr-dpia',
  'ai-act-annex-iv',
  'csrd-report',
  'compliance-roadmap',
] as const;

async function main(): Promise<void> {
  for (const kind of kinds) {
    const result = await generator.generate({
      kind: kind as never,
      profile: acme,
      answers: acmeColdStartAnswers,
      gaps: plan.gaps,
      roadmap: plan.roadmap,
      format: 'docx',
      outputPath: path.join(outDir, `${kind}.docx`),
    });
    console.log('DOCX', kind, result.bytes, 'bytes', result.wordCount, 'words');
  }

  const html = await generator.generate({
    kind: 'gdpr-dpia',
    profile: acme,
    answers: acmeColdStartAnswers,
    gaps: plan.gaps,
    format: 'html',
    outputPath: path.join(outDir, 'dpia.html'),
  });
  console.log('HTML', html.bytes, 'bytes ->', html.path);

  const pdf = await generator.generate({
    kind: 'ai-act-annex-iv',
    profile: acme,
    answers: acmeColdStartAnswers,
    gaps: plan.gaps,
    format: 'pdf',
    outputPath: path.join(outDir, 'annex-iv.pdf'),
  });
  console.log('PDF request ->', pdf.format, pdf.path, pdf.warning ?? 'rendered');

  const docxPath = path.join(outDir, 'gdpr-dpia.docx');
  if (fs.existsSync(docxPath)) {
    const buf = fs.readFileSync(docxPath);
    console.log('DOCX magic ok:', buf.slice(0, 2).toString() === 'PK');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});