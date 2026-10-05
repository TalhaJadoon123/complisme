/**
 * Detection rules.
 *
 * Each rule looks at the normalised `SourceEvent` stream produced by the parser
 * layer and emits `Finding`s already mapped to the framework articles they
 * engage. The mapping is the product: "you call OpenAI with a user's email" is
 * not a code smell, it is EU AI Act Art. 50 transparency plus GDPR Art. 5(1)(b)
 * purpose limitation plus a Chapter V transfer question.
 */

import { relativePath, stableId } from '@complisme/shared';
import type {
  Finding,
  FindingCategory,
  FindingSeverity,
  FrameworkArticleRef,
} from '@complisme/shared';

import type { Language, ParsedFile, SourceEvent } from './parser';

export interface RuleContext {
  file: string;
  /** Path relative to the scan root. */
  relFile: string;
  source: string;
  parsed: ParsedFile;
  language: Language;
}

export interface Rule {
  id: string;
  title: string;
  category: FindingCategory;
  severity: FindingSeverity;
  confidence: number;
  description: string;
  remediation: string;
  mappings: Array<{ frameworkId: string; articleId: string; reason: string }>;
  /** Return events that should be reported. */
  match: (context: RuleContext) => Array<{ event: SourceEvent; confidence?: number; note?: string }>;
}

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/** Field and variable names that indicate personal data. */
const PII_TERMS = [
  'email', 'e_mail', 'mail',
  'phone', 'mobile', 'telephone',
  'firstname', 'first_name', 'lastname', 'last_name', 'fullname', 'full_name',
  'username', 'user_name', 'nickname',
  'password', 'passwd',
  'address', 'street', 'postcode', 'zipcode', 'zip_code', 'postal_code',
  'birthdate', 'birth_date', 'dob', 'date_of_birth', 'age',
  'nationalid', 'national_id', 'ssn', 'tax_id', 'vat_id', 'passport',
  'creditcard', 'credit_card', 'cardnumber', 'card_number', 'cvv', 'iban',
  'salary', 'income', 'compensation',
  'location', 'geolocation', 'geo_location', 'latitude', 'longitude', 'lat', 'lng', 'ip', 'ip_address',
  'gender', 'sex', 'ethnicity', 'religion', 'political_opinion',
  'photo', 'avatar', 'face', 'fingerprint', 'voiceprint',
  'employee_id', 'employeeid', 'customer_id', 'customerid', 'user_id', 'userid', 'patient_id',
  'health', 'medical', 'diagnosis', 'disability', 'pregnancy', 'union_membership',
];

/** Special category data (GDPR Art. 9). */
const SENSITIVE_TERMS = [
  'health', 'medical', 'diagnosis', 'patient', 'disability', 'mental',
  'biometric', 'fingerprint', 'face_template', 'voiceprint', 'retina', 'iris',
  'ethnicity', 'ethnic_origin', 'racial', 'religion', 'religious', 'political_opinion',
  'trade_union', 'union_membership', 'sexual_orientation', 'sex_life',
  'genetic', 'dna', 'criminal_conviction', 'criminal_record', 'offence',
  'pregnancy',
];

const AI_PROVIDERS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /openai|azure[._-]?openai/i, name: 'OpenAI' },
  { pattern: /anthropic|claude/i, name: 'Anthropic' },
  { pattern: /\bcohere\b|command-r/i, name: 'Cohere' },
  { pattern: /mistral/i, name: 'Mistral' },
  { pattern: /huggingface|transformers|@xenova|sentence-transformers|ollama/i, name: 'Open models' },
  { pattern: /replicate\b|groq|together\.ai|perplexity/i, name: 'AI platform' },
  { pattern: /bedrock|vertexai|vertex[._-]?ai|google[._-]?generative|gemini/i, name: 'Google / AWS' },
];

const AI_FUNCTIONS = [
  'embedding', 'embed', 'embeddings', 'createEmbedding',
  'classify', 'classifyText', 'moderate',
  'complete', 'completion', 'chat', 'chatCompletion', 'generate', 'generateText',
  'summarize', 'summarise', 'transcribe', 'transcribeAudio',
  'analyze', 'analyse', 'extract', 'answerQuestion', 'translate',
];

const LOG_FUNCTIONS = /(^|\.)(log|logger|logging|print|printf|println|info|warn|warning|error|debug|trace|fatal|console\.(log|info|warn|error|debug))$/i;

const DB_CLIENTS = /^(mongoose|prisma|sequelize|typeorm|knex|sql|db|database|redis|pg|mysql|sqlite|dynamo|supabase|firebase|firestore|mongo|client|collection|repo|repository)\b/i;

const EXTERNAL_HOSTS = [
  'api.openai.com', 'api.anthropic.com', 'generativelanguage.googleapis.com',
  'amazonaws.com', 'stripe.com', 'api.stripe.com', 'sendgrid.com',
  'mailchimp.com', 'twilio.com', 'slack.com', 'api.github.com',
  'sentry.io', 'segment.io', 'mixpanel.com', 'amplitude.com', 'posthog.com',
];

// ---------------------------------------------------------------------------
// Rule helpers
// ---------------------------------------------------------------------------

/**
 * Normalise an identifier for vocabulary matching: split camelCase/PascalCase
 * into words, then collapse to lowercase snake_case so `customerId`,
 * `customer_id` and `CustomerID` all compare equal.
 */
function normalise(value: string): string {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function hasPii(value: string): string[] {
  const flat = normalise(value);
  const parts = flat.split('_');
  return PII_TERMS.filter((term) => {
    const t = normalise(term);
    if (!t) return false;
    return parts.includes(t) || flat.includes(t);
  });
}

function hasSensitive(value: string): string[] {
  const flat = normalise(value);
  const parts = flat.split('_');
  return SENSITIVE_TERMS.filter((term) => {
    const t = normalise(term);
    return parts.includes(t) || flat.includes(t);
  });
}

function isAiProvider(name: string): string | undefined {
  return AI_PROVIDERS.find((p) => p.pattern.test(name))?.name;
}

function aiFunctionLike(name: string): boolean {
  const tail = name.split('.').pop() ?? name;
  return AI_FUNCTIONS.some((fn) => tail.toLowerCase() === fn.toLowerCase());
}

function isLogEvent(event: SourceEvent): boolean {
  if (event.kind === 'log') return true;
  const tail = event.name.split('.').pop() ?? '';
  return LOG_FUNCTIONS.test(tail) && event.args.length > 0;
}

/** Does any argument in the event reference personal data? */
function piiInArgs(args: string[]): string[] {
  const terms = new Set<string>();
  for (const arg of args) {
    for (const term of hasPii(arg)) terms.add(term);
  }
  return [...terms];
}

function finding(
  rule: Rule,
  context: RuleContext,
  event: SourceEvent,
  confidence = rule.confidence,
  note?: string,
): Finding {
  const ref: FrameworkArticleRef[] = rule.mappings.map((m) => ({
    frameworkId: m.frameworkId,
    articleId: m.articleId,
    reason: m.reason,
  }));
  return {
    id: stableId('finding', context.relFile, event.line, rule.id, event.name),
    ruleId: rule.id,
    category: rule.category,
    severity: rule.severity,
    message: note ? `${rule.title}: ${note}` : rule.title,
    file: context.relFile,
    line: event.line,
    column: event.column,
    endLine: event.line,
    snippet: event.snippet,
    confidence: Math.min(1, Math.max(0, confidence)),
    mappings: ref,
    symbol: event.name,
    remediation: rule.remediation,
  };
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

const consentCaptured: Rule = {
  id: 'consent/capture',
  title: 'Consent capture mechanism detected',
  category: 'consent',
  severity: 'info',
  confidence: 0.85,
  description: 'A consent or cookie-consent mechanism is present. Record it as evidence for GDPR Art. 7.',
  remediation:
    'Document what is collected, the legal basis per purpose and the withdrawal path. Register the consent receipts as evidence for Art. 7(1).',
  mappings: [
    { frameworkId: 'gdpr', articleId: 'art-5-principles', reason: 'Consent must be recorded to demonstrate Art. 5(2) accountability' },
    { frameworkId: 'gdpr', articleId: 'art-7-repudation', reason: 'Records of consent under Art. 7(1)' },
  ],
  match: ({ parsed }) =>
    parsed.events
      .filter(
        (e) =>
          e.kind === 'call' &&
          /consent|cookiebot|cookiebot|onetrust|cookieyes|cookie_script|opt_?in|optin|gdpr_consent/i.test(e.name + ' ' + e.args.join(' ')),
      )
      .map((event) => ({ event })),
};

const consentMissing: Rule = {
  id: 'consent/missing-before-processing',
  title: 'Personal data processed without a visible consent or lawful-basis check',
  category: 'consent',
  severity: 'high',
  confidence: 0.6,
  description:
    'Personal data is collected while no consent gate, lawful-basis assertion or opt-out check appears on the path.',
  remediation:
    'Add an explicit lawful-basis check before this call: either a consent assertion, a documented Art. 6 basis, or a legitimate interest assessment. If consent is the basis, it must be granular, freely given and withdrawable.',
  mappings: [
    { frameworkId: 'gdpr', articleId: 'art-6-legal-basis', reason: 'No Art. 6 lawful basis evidenced on this path' },
    { frameworkId: 'gdpr', articleId: 'art-5-principles', reason: 'Art. 5(1)(a) lawfulness, fairness and transparency' },
  ],
  match: (context) => {
    const { parsed } = context;
    const hasConsentGate = parsed.events.some((e) =>
      /consent|opt_?in|optout|opt_out|legal_?basis|hasPermission|checkPermission|isAuthorized/i.test(e.name),
    );
    if (hasConsentGate) return [];
    return parsed.events
      .filter((e) => e.kind === 'call' && piiInArgs(e.args).length > 0 && isCollectorCall(e.name))
      .map((event) => ({ event, note: `fields: ${piiInArgs(event.args).join(', ')}` }));
  },
};

const piiCollection: Rule = {
  id: 'pii/collection',
  title: 'Personal data collected',
  category: 'pii-collection',
  severity: 'medium',
  confidence: 0.7,
  description: 'An identifiable personal data field is collected or persisted.',
  remediation:
    'Add this field to the ROPA with its purpose and lawful basis, publish it in the privacy notice, and confirm it is necessary for the stated purpose (data minimisation, Art. 5(1)(c)).',
  mappings: [
    { frameworkId: 'gdpr', articleId: 'art-5-principles', reason: 'Art. 5(1)(a)-(c) lawfulness, transparency and minimisation' },
    { frameworkId: 'gdpr', articleId: 'art-30-ropa', reason: 'Must appear as a processing activity in the ROPA' },
    { frameworkId: 'gdpr', articleId: 'art-13-14-transparency', reason: 'Art. 13 information duty for collected data' },
  ],
  match: ({ parsed }) =>
    parsed.events
      .filter(
        (e) =>
          (e.kind === 'assignment' || e.kind === 'call' || e.kind === 'declaration') &&
          (e.name !== 'function' && hasPii(e.name).length > 0 || e.args.some((a) => hasPii(a).length > 0)),
      )
      .map((event) => {
        const terms = [...new Set([...hasPii(event.name), ...piiInArgs(event.args)])];
        return { event, note: terms.join(', ') };
      })
      .slice(0, 40),
};

const sensitiveData: Rule = {
  id: 'pii/special-category',
  title: 'Special category personal data (GDPR Art. 9)',
  category: 'sensitive-data',
  severity: 'critical',
  confidence: 0.7,
  description:
    'Health, biometric, political, union or criminal-conviction data is processed. Article 9 prohibits this unless an Art. 9(2) exception applies.',
  remediation:
    'Document the Art. 9(2) exception you rely on (usually (a) explicit consent or (g) substantial public interest with an EU/member-state basis), apply it as a separate consent from Art. 6 consent, and record the DPIA for this processing.',
  mappings: [
    { frameworkId: 'gdpr', articleId: 'art-6-legal-basis', reason: 'Art. 9 requires an additional exception on top of Art. 6' },
    { frameworkId: 'gdpr', articleId: 'art-35-dpia', reason: 'Large-scale Art. 9 processing normally triggers a mandatory DPIA' },
    { frameworkId: 'eu-ai-act', articleId: 'art-10-data-governance', reason: 'AI Act Art. 10(3) restricts special-category training data' },
  ],
  match: ({ parsed }) =>
    parsed.events
      .filter(
        (e) =>
          (e.kind === 'assignment' || e.kind === 'call' || e.kind === 'declaration') &&
          [...hasSensitive(e.name), ...hasSensitive(e.args.join(' '))].length > 0,
      )
      .map((event) => ({
        event,
        note: [...new Set([...hasSensitive(event.name), ...hasSensitive(event.args.join(' '))])].join(', '),
      }))
      .slice(0, 30),
};

const personalDataLogging: Rule = {
  id: 'gdpr/personal-data-logging',
  title: 'Personal data written to logs',
  category: 'personal-data-logging',
  severity: 'high',
  confidence: 0.75,
  description:
    'A logging call serialises personal data. Log lines inherit the obligations of the data they contain: access control, retention and breach notification.',
  remediation:
    'Remove the field from the log call, or hash/tokenise it. If it must be logged, document the purpose, set a retention period, restrict log access and add the log store to the ROPA as a processing activity.',
  mappings: [
    { frameworkId: 'gdpr', articleId: 'art-25-32-security', reason: 'Logs containing personal data need Art. 32 measures' },
    { frameworkId: 'gdpr', articleId: 'art-5-principles', reason: 'Storage limitation (Art. 5(1)(e)) applies to log data' },
    { frameworkId: 'gdpr', articleId: 'art-30-ropa', reason: 'The log store is itself a processing activity' },
  ],
  match: ({ parsed }) =>
    parsed.events
      .filter((e) => isLogEvent(e) && (piiInArgs(e.args).length > 0 || hasSensitive(e.args.join(' ')).length > 0))
      .map((event) => ({
        event,
        note: [...new Set([...piiInArgs(event.args), ...hasSensitive(event.args.join(' '))])].join(', '),
      }))
      .slice(0, 40),
};

const unstructuredLogging: Rule = {
  id: 'gdpr/unstructured-logging',
  title: 'Whole object serialised into logs',
  category: 'unstructured-storage',
  severity: 'medium',
  confidence: 0.55,
  description:
    'An entire object is logged (`console.log(user)`, `logger.info(request.body)`), which almost always pulls personal data into the log store without a field-level decision.',
  remediation:
    'Log an explicit allow-list of fields instead of the whole object. Anything logged becomes personal data you must protect and eventually delete.',
  mappings: [
    { frameworkId: 'gdpr', articleId: 'art-5-principles', reason: 'Data minimisation (Art. 5(1)(c))' },
    { frameworkId: 'gdpr', articleId: 'art-25-32-security', reason: 'Art. 32 confidentiality of the log store' },
  ],
  match: ({ parsed }) =>
    parsed.events
      .filter(
        (e) =>
          isLogEvent(e) &&
          e.args.some((arg) => /\b(user|customer|person|profile|account|request|body|payload|record|row|employee|patient|applicant)\b/i.test(arg)),
      )
      .map((event) => ({ event, confidence: 0.5 }))
      .slice(0, 25),
};

const retentionRule: Rule = {
  id: 'gdpr/retention',
  title: 'Retention handling',
  category: 'retention',
  severity: 'info',
  confidence: 0.8,
  description: 'A retention period is defined in code. Good — it just needs to be recorded in the ROPA and enforced.',
  remediation:
    'Mirror this value into the ROPA retention column and confirm deletion is actually executed (a scheduled job, a TTL index or a lifecycle rule), not just declared.',
  mappings: [
    { frameworkId: 'gdpr', articleId: 'art-5-principles', reason: 'Storage limitation, Art. 5(1)(e)' },
    { frameworkId: 'gdpr', articleId: 'art-30-ropa', reason: 'Retention must appear per processing activity' },
  ],
  match: ({ parsed }) =>
    parsed.events
      .filter(
        (e) =>
          e.kind === 'assignment' &&
          /retention|expires?_?at|ttl|max_?age|keep_?for|delete_?after|purge/i.test(e.name) &&
          /\d/.test(e.args.join(' ')),
      )
      .map((event) => ({ event })),
};

const retentionMissing: Rule = {
  id: 'gdpr/no-retention-on-store',
  title: 'Personal data stored without a visible retention or deletion rule',
  category: 'retention',
  severity: 'medium',
  confidence: 0.5,
  description:
    'A write to a data store carries personal data, and no TTL, deletion or retention field is visible on the same file or call site.',
  remediation:
    'Add an explicit retention policy: a `expiresAt` column, a TTL index, or a scheduled purge. Then record the period in the ROPA. Storage limitation is the single most common finding in SME audits.',
  mappings: [
    { frameworkId: 'gdpr', articleId: 'art-5-principles', reason: 'Art. 5(1)(e) storage limitation' },
    { frameworkId: 'gdpr', articleId: 'art-30-ropa', reason: 'Retention period must be documented per activity' },
  ],
  match: (context) => {
    const { parsed } = context;
    const hasRetention = parsed.events.some((e) => /retention|expires?_?at|ttl|max_?age|purge|delete_?after/i.test(e.name));
    if (hasRetention) return [];
    return parsed.events
      .filter(
        (e) =>
          e.kind === 'call' &&
          DB_CLIENTS.test(e.name) &&
          /(insert|create|save|put|set|add|upsert|write|post)\w*$/i.test(e.name.split('.').pop() ?? '') &&
          (piiInArgs(e.args).length > 0 || e.args.some((a) => /\b(user|customer|person|profile|account|employee|patient)\b/i.test(a))),
      )
      .map((event) => ({ event, confidence: 0.45 }))
      .slice(0, 20);
  },
};

const aiApiCall: Rule = {
  id: 'ai-act/api-call',
  title: 'AI model API call',
  category: 'ai-api-call',
  severity: 'info',
  confidence: 0.8,
  description:
    'A call to a generative AI or embedding provider. This is an AI system under the EU AI Act and a processing activity under the GDPR.',
  remediation:
    'Add the call to the AI inventory with purpose, model and vendor. Classify it under Art. 6, document the data sent, disclose the AI interaction to users (Art. 50), and record the sub-processor transfer if the provider is outside the EEA.',
  mappings: [
    { frameworkId: 'eu-ai-act', articleId: 'art-6-classification', reason: 'Every AI system must be classified under Art. 6' },
    { frameworkId: 'eu-ai-act', articleId: 'art-50-transparency-obligations', reason: 'Users must be told they interact with AI (Art. 50)' },
    { frameworkId: 'eu-ai-act', articleId: 'art-4-ai-literacy', reason: 'Staff operating the system need AI literacy (Art. 4)' },
    { frameworkId: 'gdpr', articleId: 'art-6-legal-basis', reason: 'Data sent to the model is processing that needs a lawful basis' },
    { frameworkId: 'gdpr', articleId: 'art-44-49-transfers', reason: 'Most AI providers process data outside the EEA (Chapter V)' },
  ],
  match: ({ parsed }) =>
    parsed.events
      .filter(
        (e) =>
          e.kind === 'call' &&
          (isAiProvider(e.name) || isAiProvider(e.module ?? '') || isAiProvider(e.args.join(' ')) || aiFunctionLike(e.name)),
      )
      .map((event) => {
        const provider = isAiProvider(event.name) ?? isAiProvider(event.module ?? '') ?? isAiProvider(event.args.join(' '));
        return { event, note: provider ? `${provider} via ${event.name}` : event.name };
      })
      .slice(0, 40),
};

const aiWithPersonalData: Rule = {
  id: 'ai-act/pii-to-model',
  title: 'Personal data sent to an AI provider',
  category: 'ai-api-call',
  severity: 'critical',
  confidence: 0.65,
  description:
    'Fields that look like personal data are included in an AI API call. This is the highest-risk pattern in an SME codebase: it triggers the AI Act, the GDPR and Chapter V at once.',
  remediation:
    'Minimise the payload: send identifiers rather than raw personal data, pseudonymise before the call, or aggregate server-side. Document the transfer basis, add the provider to the sub-processor list, and check for training-on-your-data opt-out.',
  mappings: [
    { frameworkId: 'eu-ai-act', articleId: 'art-10-data-governance', reason: 'Art. 10 governs the data used by AI systems' },
    { frameworkId: 'eu-ai-act', articleId: 'art-9-risk-management', reason: 'Personal data in model input is a risk to be assessed and mitigated' },
    { frameworkId: 'gdpr', articleId: 'art-5-principles', reason: 'Data minimisation, Art. 5(1)(c)' },
    { frameworkId: 'gdpr', articleId: 'art-44-49-transfers', reason: 'Provider-side processing is usually outside the EEA' },
  ],
  match: ({ parsed }) =>
    parsed.events
      .filter(
        (e) =>
          e.kind === 'call' &&
          (isAiProvider(e.name) || aiFunctionLike(e.name) || isAiProvider(e.module ?? '')) &&
          (piiInArgs(e.args).length > 0 || hasSensitive(e.args.join(' ')).length > 0),
      )
      .map((event) => ({
        event,
        note: [...new Set([...piiInArgs(event.args), ...hasSensitive(event.args.join(' '))])].join(', '),
      }))
      .slice(0, 30),
};

const profilingRule: Rule = {
  id: 'gdpr/profiling',
  title: 'Profiling or scoring of individuals',
  category: 'profiling',
  severity: 'high',
  confidence: 0.6,
  description:
    'A score, rank, risk or recommendation is computed for an individual. Profiling triggers the Art. 13(2)(f) information duty and, where the outcome has legal or similar significant effect, Art. 22.',
  remediation:
    'Document the logic in plain language, add the Art. 13(2)(f) information to the privacy notice, provide a human review path, and confirm no decision with legal effect is taken solely automatically.',
  mappings: [
    { frameworkId: 'gdpr', articleId: 'art-5-principles', reason: 'Art. 5(1)(a) transparency of automated processing' },
    { frameworkId: 'gdpr', articleId: 'art-35-dpia', reason: 'Profiling of individuals normally requires a DPIA' },
    { frameworkId: 'eu-ai-act', articleId: 'art-5-prohibited-practices', reason: 'Check Art. 5: social scoring and exploitation red lines' },
  ],
  match: ({ parsed }) =>
    parsed.events
      .filter(
        (e) =>
          (e.kind === 'assignment' || e.kind === 'call' || e.kind === 'declaration') &&
          /(credit_?score|risk_?score|score|ranking|rank|propensity|churn_?score|fraud_?score|eligibility|recommend|segment|cluster|classif)/i.test(
            e.name + ' ' + e.args.join(' '),
          ),
      )
      .map((event) => ({ event }))
      .slice(0, 25),
};

const biometricRule: Rule = {
  id: 'gdpr/biometric',
  title: 'Biometric processing',
  category: 'biometric',
  severity: 'critical',
  confidence: 0.6,
  description:
    'Biometric data (face, fingerprint, voice) is processed. Article 9 prohibits this unless an Art. 9(2) exception applies, and the AI Act bans certain biometric uses outright.',
  remediation:
    'Stop and verify before shipping. Art. 9(2) plus an Art. 27 DPIA is the minimum; the AI Act Art. 5 prohibition applies to biometric categorisation and workplace emotion recognition.',
  mappings: [
    { frameworkId: 'gdpr', articleId: 'art-6-legal-basis', reason: 'Art. 9(2) exception required' },
    { frameworkId: 'gdpr', articleId: 'art-35-dpia', reason: 'Mandatory DPIA for large-scale biometric processing' },
    { frameworkId: 'eu-ai-act', articleId: 'art-5-prohibited-practices', reason: 'Art. 5(1)(f) workplace emotion recognition is prohibited' },
  ],
  match: ({ parsed }) =>
    parsed.events
      .filter(
        (e) =>
          (e.kind === 'assignment' || e.kind === 'call' || e.kind === 'declaration') &&
          hasSensitive(e.name).some((t) => ['biometric', 'fingerprint', 'face_template', 'voiceprint', 'iris', 'retina'].includes(t)),
      )
      .map((event) => ({ event })),
};

const encryptionMissing: Rule = {
  id: 'security/no-encryption',
  title: 'Data store created without visible encryption',
  category: 'encryption',
  severity: 'medium',
  confidence: 0.45,
  description:
    'A data store is instantiated with no encryption option visible. Absence of evidence is not evidence of absence, but Article 32 expects you to be able to demonstrate the measure.',
  remediation:
    'Enable encryption at rest (managed database encryption, or field-level encryption for sensitive columns), enable TLS for every connection, and document who holds the keys.',
  mappings: [
    { frameworkId: 'gdpr', articleId: 'art-25-32-security', reason: 'Art. 32(1)(a) encryption as an appropriate TOM' },
    { frameworkId: 'eu-ai-act', articleId: 'art-15-accuracy-robustness', reason: 'AI Act Art. 15(4) cybersecurity' },
  ],
  match: (context) => {
    const { parsed } = context;
    if (/encrypt|cipher|atRest|tls/i.test(context.source)) return [];
    return parsed.events
      .filter(
        (e) =>
          e.kind === 'call' &&
          DB_CLIENTS.test(e.name) &&
          /(connect|create_?client|get_?client|new_?client|createconnection|openconnection|pool)/i.test(e.name) &&
          !/ssl|tls|encrypt/i.test(e.args.join(' ')),
      )
      .map((event) => ({ event }))
      .slice(0, 15);
  },
};

const transferRule: Rule = {
  id: 'gdpr/external-transfer',
  title: 'Personal data sent to an external service',
  category: 'data-transfer',
  severity: 'high',
  confidence: 0.7,
  description:
    'Personal data leaves your infrastructure for a third-party service. That makes the recipient a processor (Art. 28) and, if outside the EEA, an international transfer (Chapter V).',
  remediation:
    'Sign an Art. 28 DPA, register the transfer, and apply the correct safeguard: adequacy decision, SCCs (EU) 2021/914 with the right module, plus a transfer impact assessment for supplementary measures.',
  mappings: [
    { frameworkId: 'gdpr', articleId: 'art-6-legal-basis', reason: 'Art. 28(3) processor contract required' },
    { frameworkId: 'gdpr', articleId: 'art-44-49-transfers', reason: 'Chapter V transfer safeguards' },
    { frameworkId: 'gdpr', articleId: 'art-30-ropa', reason: 'Recipients and transfers belong in the ROPA' },
  ],
  match: ({ parsed }) =>
    parsed.events
      .filter((e) => e.kind === 'call' && EXTERNAL_HOSTS.some((host) => e.args.join(' ').toLowerCase().includes(host)))
      .map((event) => ({
        event,
        note: EXTERNAL_HOSTS.find((host) => event.args.join(' ').toLowerCase().includes(host)) ?? '',
      }))
      .slice(0, 30),
};

const accessControlRule: Rule = {
  id: 'security/hardcoded-secret',
  title: 'Hardcoded credential next to personal data handling',
  category: 'access-control',
  severity: 'high',
  confidence: 0.6,
  description:
    'A credential is written literally in source. If it is a database or API credential for a personal-data store, the access-control claim cannot be evidenced.',
  remediation:
    'Move the secret to a secret manager or environment variable, rotate the exposed credential, and confirm who has production access and how it is reviewed.',
  mappings: [
    { frameworkId: 'gdpr', articleId: 'art-25-32-security', reason: 'Art. 32(1)(b) ongoing confidentiality and access control' },
  ],
  match: ({ parsed }) =>
    parsed.events
      .filter(
        (e) =>
          e.kind === 'assignment' &&
          /(password|passwd|secret|api_?key|access_?token|private_?key|client_?secret|conn(ection)?_?string)/i.test(e.name) &&
          e.args.some((arg) => /^['"`][^'"`]{6,}['"`]$/.test(arg.trim())),
      )
      .map((event) => ({ event }))
      .slice(0, 20),
};

const cookieRule: Rule = {
  id: 'gdpr/cookie-consent',
  title: 'Non-essential cookie or tracker without a consent gate',
  category: 'cookie-consent',
  severity: 'high',
  confidence: 0.55,
  description:
    'An analytics or advertising tag is installed without an evident prior consent check, which is the most frequently enforced cookie rule in the EU (ePrivacy + GDPR).',
  remediation:
    'Initialise the consent manager before any tracker loads, gate non-essential tags on consent, and record the consent state so you can prove it was given.',
  mappings: [
    { frameworkId: 'gdpr', articleId: 'art-6-legal-basis', reason: 'Cookies need an Art. 6 basis; non-essential ones need consent' },
    { frameworkId: 'gdpr', articleId: 'art-5-principles', reason: 'Transparency about tracking (Art. 5(1)(a))' },
  ],
  match: ({ parsed }) =>
    parsed.events
      .filter(
        (e) =>
          e.kind === 'call' &&
          /(gtag|ga_google|googletagmanager|fbq|facebook|hotjar|clarity|matomo|posthog|mixpanel|segment|amplitude|adroll|doubleclick|linkedin_?insight|intercom)/i.test(
            e.name,
          ) &&
          !parsed.events.some((c) => /onConsent|consent/i.test(c.name)),
      )
      .map((event) => ({ event }))
      .slice(0, 20),
};

function isCollectorCall(name: string): boolean {
  return /(insert|create|save|put|set|add|upsert|write|post|register|signup|sign_?up|collect|query|find|scan|aggregate|insertmany|updateone|update_many|createindex)/i.test(
    name,
  );
}

export const RULES: Rule[] = [
  consentMissing,
  consentCaptured,
  piiCollection,
  sensitiveData,
  biometricRule,
  profilingRule,
  aiWithPersonalData,
  aiApiCall,
  personalDataLogging,
  unstructuredLogging,
  retentionMissing,
  retentionRule,
  transferRule,
  cookieRule,
  encryptionMissing,
  accessControlRule,
];

export function ruleById(id: string): Rule | undefined {
  return RULES.find((r) => r.id === id);
}

export { hasPii, hasSensitive, isAiProvider, aiFunctionLike, isCollectorCall, finding };