/**
 * Parsing layer.
 *
 * TypeScript/JavaScript are parsed with the TypeScript compiler API — a real
 * AST, already present as a dependency, no native build step.
 *
 * Python and Go are parsed with a lightweight tokeniser that understands their
 * string/comment/triple-quote/indent rules well enough to recover call targets,
 * assignments and logging calls with accurate line numbers.
 *
 * A tree-sitter WASM backend is supported through `TreeSitterParser`: when
 * `web-tree-sitter` and the grammar `.wasm` files are installed, it is used
 * instead of the built-in parsers. It is optional by design — the scanner must
 * run in a container with no native compilation.
 */

import fs from 'node:fs';

import type * as ts from 'typescript';

import type { FindingCategory } from '@complisme/shared';

export type Language = 'typescript' | 'javascript' | 'python' | 'go' | 'unknown';

export const EXTENSION_LANGUAGE: Record<string, Language> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.pyi': 'python',
  '.go': 'go',
};

export function languageOf(file: string): Language {
  const dot = file.lastIndexOf('.');
  if (dot === -1) return 'unknown';
  return EXTENSION_LANGUAGE[file.slice(dot).toLowerCase()] ?? 'unknown';
}

/** A normalised event the rules operate on. Keeping it AST-shaped makes rules identical across languages. */
export interface SourceEvent {
  kind: 'call' | 'assignment' | 'log' | 'declaration' | 'literal';
  /** The callee name or assigned identifier. */
  name: string;
  line: number;
  column: number;
  /** Source line, trimmed. */
  snippet: string;
  /** Arguments as raw strings (best effort). */
  args: string[];
  /** Imported module for a call, when resolvable. */
  module?: string;
  /** Whether the call is awaited. */
  awaited?: boolean;
}

export interface ParsedFile {
  language: Language;
  events: SourceEvent[];
  imports: Array<{ name: string; module: string }>;
  lineCount: number;
  parser: string;
}

export interface Parser {
  name: string;
  supports(language: Language): boolean;
  parse(file: string, source: string): ParsedFile;
}

// ---------------------------------------------------------------------------
// TypeScript / JavaScript
// ---------------------------------------------------------------------------

class TypeScriptParser implements Parser {
  name = 'typescript-compiler-api';

  supports(language: Language): boolean {
    return language === 'typescript' || language === 'javascript';
  }

  parse(file: string, source: string): ParsedFile {
    // Lazy require: the TS compiler is a big module and only JS/TS needs it.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const tsc: typeof ts = require('typescript');
    const scriptKind =
      file.endsWith('.tsx') ? tsc.ScriptKind.TSX : file.endsWith('.jsx') ? tsc.ScriptKind.JSX : tsc.ScriptKind.TSX;
    const sf = tsc.createSourceFile(file, source, tsc.ScriptTarget.Latest, true, scriptKind);
    const lines = source.split(/\r?\n/);
    const events: SourceEvent[] = [];
    const imports: Array<{ name: string; module: string }> = [];

    const snippetAt = (line: number) => (lines[line - 1] ?? '').trim().slice(0, 240);

    const positionOf = (node: ts.Node) => sf.getLineAndCharacterOfPosition(node.getStart(sf));

    const visit = (node: ts.Node, moduleName?: string) => {
      if (tsc.isImportDeclaration(node) && node.moduleSpecifier && tsc.isStringLiteral(node.moduleSpecifier)) {
        const mod = node.moduleSpecifier.text;
        const clause = node.importClause;
        const local = clause?.name?.getText(sf);
        if (local) imports.push({ name: local, module: mod });
        const bindings = clause?.namedBindings;
        if (bindings && tsc.isNamedImports(bindings)) {
          for (const element of bindings.elements) {
            imports.push({ name: element.name.getText(sf), module: mod });
          }
        }
        if (bindings && tsc.isNamespaceImport(bindings)) {
          imports.push({ name: bindings.name.getText(sf), module: mod });
        }
      }

      if (tsc.isCallExpression(node)) {
        const { line, character } = positionOf(node);
        events.push({
          kind: 'call',
          name: calleeName(node.expression, tsc),
          line,
          column: character + 1,
          snippet: snippetAt(line),
          args: node.arguments.map((arg) => arg.getText(sf).slice(0, 200)),
          module: moduleName,
          awaited: isAwaited(node, tsc),
        });
      }

      if (tsc.isNewExpression(node)) {
        const { line, character } = positionOf(node);
        events.push({
          kind: 'call',
          name: `new ${calleeName(node.expression, tsc)}`,
          line,
          column: character + 1,
          snippet: snippetAt(line),
          args: (node.arguments ?? []).map((arg) => arg.getText(sf).slice(0, 200)),
          module: moduleName,
        });
      }

      if (tsc.isBinaryExpression(node) && node.operatorToken.kind === tsc.SyntaxKind.EqualsToken) {
        const left = node.left;
        if (tsc.isIdentifier(left) || tsc.isPropertyAccessExpression(left)) {
          const { line, character } = positionOf(node);
          events.push({
            kind: 'assignment',
            name: left.getText(sf),
            line,
            column: character + 1,
            snippet: snippetAt(line),
            args: [node.right.getText(sf).slice(0, 200)],
            module: moduleName,
          });
        }
      }

      if (tsc.isPropertyAssignment(node) && tsc.isIdentifier(node.name)) {
        const { line, character } = positionOf(node);
        events.push({
          kind: 'assignment',
          name: node.name.getText(sf),
          line,
          column: character + 1,
          snippet: snippetAt(line),
          args: [node.initializer.getText(sf).slice(0, 200)],
          module: moduleName,
        });
      }

      if (tsc.isVariableDeclaration(node) && tsc.isIdentifier(node.name) && node.initializer) {
        const { line, character } = positionOf(node);
        events.push({
          kind: 'declaration',
          name: node.name.getText(sf),
          line,
          column: character + 1,
          snippet: snippetAt(line),
          args: [node.initializer.getText(sf).slice(0, 200)],
          module: moduleName,
        });
      }

      if (tsc.isStringLiteral(node) || tsc.isNoSubstitutionTemplateLiteral(node)) {
        const parent = node.parent;
        const inImport = tsc.isImportDeclaration(parent) || tsc.isExportDeclaration(parent);
        if (!inImport && node.text.length > 0) {
          const { line, character } = positionOf(node);
          events.push({
            kind: 'literal',
            name: 'string',
            line,
            column: character + 1,
            snippet: snippetAt(line),
            args: [node.text.slice(0, 200)],
          });
        }
      }

      tsc.forEachChild(node, (child) => visit(child, moduleName));
    };

    visit(sf);

    return {
      language: languageOf(file),
      events,
      imports,
      lineCount: lines.length,
      parser: this.name,
    };
  }
}

function calleeName(expression: ts.Expression, tsc: typeof ts): string {
  if (tsc.isIdentifier(expression)) return expression.text;
  if (tsc.isPropertyAccessExpression(expression)) {
    const base = calleeName(expression.expression, tsc);
    return base ? `${base}.${expression.name.getText()}` : expression.name.getText();
  }
  if (tsc.isElementAccessExpression(expression)) {
    const base = calleeName(expression.expression, tsc);
    const arg = expression.argumentExpression.getText();
    return base ? `${base}[${arg}]` : arg;
  }
  if (tsc.isCallExpression(expression)) return calleeName(expression.expression, tsc);
  return expression.getText().slice(0, 80);
}

function isAwaited(node: ts.CallExpression, tsc: typeof ts): boolean {
  let parent: ts.Node | undefined = node.parent;
  while (parent) {
    if (tsc.isAwaitExpression(parent)) return true;
    if (tsc.isVariableDeclaration(parent) || tsc.isReturnStatement(parent)) return false;
    parent = parent.parent;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Generic tokenising parser for Python and Go
// ---------------------------------------------------------------------------

class SimpleParser implements Parser {
  name = 'simple-tokeniser';

  constructor(private readonly language: 'python' | 'go') {}

  supports(language: Language): boolean {
    return language === this.language;
  }

  parse(file: string, source: string): ParsedFile {
    const lines = source.split(/\r?\n/);
    const events: SourceEvent[] = [];
    const imports: Array<{ name: string; module: string }> = [];
    let inBlockComment = false;

    lines.forEach((raw, index) => {
      const line = index + 1;
      let text = raw;

      // Python triple-quoted blocks.
      if (this.language === 'python') {
        if (inBlockComment) {
          if (text.includes('"""') || text.includes("'''")) inBlockComment = false;
          return;
        }
        if (/("""|''')/.test(text) && (text.match(/("""|''')/g) ?? []).length % 2 === 1) {
          inBlockComment = true;
          return;
        }
      }

      // Go block comments.
      if (this.language === 'go') {
        if (inBlockComment) {
          if (text.includes('*/')) inBlockComment = false;
          return;
        }
        const start = text.indexOf('/*');
        if (start !== -1 && !text.includes('*/', start)) {
          inBlockComment = true;
          return;
        }
      }

      const withoutLineComment = stripLineComment(text, this.language).trim();
      if (!withoutLineComment) return;

      if (this.language === 'python') {
        this.parsePython(withoutLineComment, line, events, imports);
      } else {
        this.parseGo(withoutLineComment, line, events, imports);
      }
    });

    return {
      language: this.language,
      events,
      imports,
      lineCount: lines.length,
      parser: this.name,
    };
  }

  private parsePython(
    line: string,
    lineNo: number,
    events: SourceEvent[],
    imports: Array<{ name: string; module: string }>,
  ): void {
    const snippet = line.slice(0, 240);

    const imp = /^(?:from\s+([\w.]+)\s+import\s+(.+)|import\s+([\w.]+)(?:\s+as\s+(\w+))?)/.exec(line);
    if (imp) {
      const module = imp[1] ?? imp[3];
      const names = (imp[2] ?? imp[4] ?? '').split(',');
      for (const name of names) {
        const clean = name.trim().split(/\s+as\s+/)[0];
        if (clean) imports.push({ name: clean, module });
      }
      return;
    }

    // def/class declaration
    const decl = /^\s*(?:async\s+)?(def|class)\s+(\w+)/.exec(line);
    if (decl) {
      events.push({
        kind: 'declaration',
        name: decl[2],
        line: lineNo,
        column: line.indexOf(decl[2]) + 1,
        snippet,
        args: [],
      });
      return;
    }

    const assign = /^([A-Za-z_][\w.\[\]'"]*)\s*(?::[^=]+)?=\s*(.+)$/.exec(line);
    if (assign) {
      events.push({
        kind: 'assignment',
        name: assign[1],
        line: lineNo,
        column: line.indexOf(assign[1]) + 1,
        snippet,
        args: [assign[2]],
      });
      return;
    }

    // Call expression, including chained calls: requests.post(...).json()
    const call = /\b([A-Za-z_][\w.]*)\s*\((.*)\)\s*(?:\.\s*(\w+))?\s*$/.exec(line);
    if (call) {
      events.push({
        kind: classifyLogging(call[1]) ? 'log' : 'call',
        name: call[3] ? `${call[1]}.${call[3]}` : call[1],
        line: lineNo,
        column: Math.max(1, line.indexOf(call[1])),
        snippet,
        args: splitArgs(call[2]),
        awaited: /\bawait\s+$/.test(line.slice(0, Math.max(0, line.indexOf(call[1])))),
      });
    }
  }

  private parseGo(
    line: string,
    lineNo: number,
    events: SourceEvent[],
    imports: Array<{ name: string; module: string }>,
  ): void {
    const snippet = line.slice(0, 240);

    const imp = /^import\s+(?:\w+\s+)?"([^"]+)"/.exec(line);
    if (imp) {
      const module = imp[1];
      const alias = new RegExp(`^\\s*(\\w+)\\s+"${module.replace(/[/.]/g, (c) => `\\${c}`)}"`).exec(line);
      imports.push({ name: alias?.[1] ?? module.split('/').pop() ?? module, module });
      return;
    }

    const decl = /^func\s+(?:\([^)]*\)\s*)?(\w+)/.exec(line);
    if (decl) {
      events.push({
        kind: 'declaration',
        name: decl[1],
        line: lineNo,
        column: line.indexOf(decl[1]) + 1,
        snippet,
        args: [],
      });
      return;
    }

    const assign = /:=\s*(.+)$/.exec(line);
    if (assign) {
      const left = line.slice(0, line.indexOf(':=')).trim();
      for (const name of left.split(',').map((s) => s.trim()).filter(Boolean)) {
        events.push({
          kind: 'assignment',
          name,
          line: lineNo,
          column: Math.max(1, line.indexOf(name)),
          snippet,
          args: [assign[1]],
        });
      }
      return;
    }

    const call = /\b([A-Za-z_][\w.]*)\s*\((.*)\)/.exec(line);
    if (call) {
      events.push({
        kind: classifyLogging(call[1]) ? 'log' : 'call',
        name: call[1],
        line: lineNo,
        column: Math.max(1, line.indexOf(call[1])),
        snippet,
        args: splitArgs(call[2]),
      });
    }
  }
}

function stripLineComment(line: string, language: 'python' | 'go'): string {
  if (language === 'python') {
    const idx = findOutsideString(line, '#');
    return idx === -1 ? line : line.slice(0, idx);
  }
  const idx = findOutsideString(line, '//');
  return idx === -1 ? line : line.slice(0, idx);
}

function findOutsideString(line: string, token: string): number {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (line.startsWith(token, i)) return i;
  }
  return -1;
}

function splitArgs(args: string): string[] {
  if (!args.trim()) return [];
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = '';
  for (const ch of args) {
    if (quote) {
      current += ch;
      if (ch === '\\') continue;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    if (ch === ')' || ch === ']' || ch === '}') depth -= 1;
    if (ch === ',' && depth === 0) {
      out.push(current.trim().slice(0, 200));
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) out.push(current.trim().slice(0, 200));
  return out;
}

function classifyLogging(name: string): boolean {
  return /(^|\.)(log|logger|logging|console\.(log|warn|error|debug|info))$|(^|\.)(Print|Printf|Println|Fatal|Fatalf|Fatalln|Errorf|Infof|Warnf|Debugf|Log|Logf|Logln)$|^log\./i.test(
    name,
  );
}

// ---------------------------------------------------------------------------
// Optional tree-sitter WASM backend
// ---------------------------------------------------------------------------

export interface TreeSitterOptions {
  wasmDir: string;
  grammars?: Partial<Record<Language, string>>;
}

/**
 * Uses web-tree-sitter when it is installed. Returns null otherwise so the caller
 * falls back to the built-in parsers.
 */
export class TreeSitterParser implements Parser {
  name = 'tree-sitter-wasm';

  constructor(private readonly options: TreeSitterOptions) {}

  supports(language: Language): boolean {
    return (
      (language === 'typescript' || language === 'javascript' || language === 'python' || language === 'go') &&
      !!this.options.grammars?.[language]
    );
  }

  parse(file: string, source: string): ParsedFile {
    throw new Error(
      'TreeSitterParser.parse requires the async initialised instance from createTreeSitterParser().',
    );
  }

  /** Async initialisation: loads the WASM runtime and the grammar for a language. */
  async parseAsync(file: string, source: string): Promise<ParsedFile> {
    const language = languageOf(file);
    const grammarPath = this.options.grammars?.[language];
    if (!grammarPath) throw new Error(`no tree-sitter grammar configured for ${language}`);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const TS = require('web-tree-sitter') as {
      Parser: new () => { init: (opts?: unknown) => Promise<void>; setLanguage: (l: unknown) => Promise<unknown>; parse: (s: string) => TreeSitterTree | null };
      Language: new () => unknown;
    };

    const parser = new TS.Parser();
    await parser.init();
    const lang = new TS.Language();
    await (lang as unknown as { load: (p: string) => Promise<void> }).load(grammarPath);
    await parser.setLanguage(lang);

    const tree = parser.parse(source);
    const events = tree ? walkTreeSitter(tree.rootNode, source) : [];
    const lines = source.split(/\r?\n/);

    return {
      language,
      events,
      imports: [],
      lineCount: lines.length,
      parser: this.name,
    };
  }
}

interface TreeSitterPoint {
  row: number;
  column: number;
}

interface TreeSitterNode {
  type: string;
  startPosition: TreeSitterPoint;
  endPosition: TreeSitterPoint;
  text: string;
  children: TreeSitterNode[];
  namedChildren?: TreeSitterNode[];
  childForFieldName?: (name: string) => TreeSitterNode | null;
}

interface TreeSitterTree {
  rootNode: TreeSitterNode;
}

function walkTreeSitter(node: TreeSitterNode, source: string): SourceEvent[] {
  const lines = source.split(/\r?\n/);
  const events: SourceEvent[] = [];
  const snippetAt = (row: number) => (lines[row] ?? '').trim().slice(0, 240);

  const visit = (current: TreeSitterNode): void => {
    if (
      current.type === 'call' ||
      current.type === 'call_expression' ||
      current.type === 'method_invocation' ||
      current.type === 'new_expression'
    ) {
      const fn = current.childForFieldName?.('function') ?? current.childForFieldName?.('method') ?? null;
      events.push({
        kind: classifyLogging(fn?.text ?? '') ? 'log' : 'call',
        name: fn?.text ?? current.type,
        line: current.startPosition.row + 1,
        column: current.startPosition.column + 1,
        snippet: snippetAt(current.startPosition.row),
        args: (current.childForFieldName?.('arguments')?.children ?? [])
          .filter((c) => c.namedChildren?.length)
          .map((c) => c.text.slice(0, 200)),
      });
    }
    if (current.type === 'assignment' || current.type === 'variable_declarator') {
      const left = current.childForFieldName?.('left') ?? current.childForFieldName?.('name');
      if (left) {
        events.push({
          kind: 'assignment',
          name: left.text,
          line: current.startPosition.row + 1,
          column: current.startPosition.column + 1,
          snippet: snippetAt(current.startPosition.row),
          args: [current.text.slice(0, 200)],
        });
      }
    }
    for (const child of current.children) visit(child);
  };

  visit(node);
  return events;
}

/** Build the parser set. */
export function defaultParsers(treeSitter?: TreeSitterParser): Parser[] {
  const parsers: Parser[] = [new TypeScriptParser(), new SimpleParser('python'), new SimpleParser('go')];
  if (treeSitter) parsers.unshift(treeSitter);
  return parsers;
}

/** Tree-sitter is available when the WASM module and a grammar are configured. */
export function treeSitterAvailable(options: TreeSitterOptions): boolean {
  if (!options?.wasmDir || !fs.existsSync(options.wasmDir)) return false;
  try {
    require.resolve('web-tree-sitter');
    return true;
  } catch {
    return false;
  }
}

export { TypeScriptParser, SimpleParser };