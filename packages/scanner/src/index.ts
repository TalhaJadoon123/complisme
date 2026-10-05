export { CodeScanner, scanCodebase, summariseScan, tryTreeSitter, DEFAULT_EXCLUDES } from './scanner';
export type { ScanResultInternal } from './scanner';

export { isWithin, resolveWithin, displayPath } from './path-safety';

export {
  parseRepo,
  issueKey,
  gapToIssue,
  findingsToIssues,
  publishIssues,
  githubStatus,
} from './github';
export type { GitHubConfig, GitHubIssue, PublishResult } from './github';

export {
  defaultParsers,
  languageOf,
  treeSitterAvailable,
  TreeSitterParser,
  TypeScriptParser,
  SimpleParser,
  EXTENSION_LANGUAGE,
} from './parser';
export type { Language, ParsedFile, Parser, ParsedFile as Parsed, SourceEvent, Parser as ParserT } from './parser';

export {
  RULES,
  ruleById,
  hasPii,
  hasSensitive,
  isAiProvider,
  aiFunctionLike,
  isCollectorCall,
} from './rules';
export type { Rule, RuleContext } from './rules';