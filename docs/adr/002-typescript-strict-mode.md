# ADR-002: TypeScript Strict Mode

## Status
Accepted

## Context
TypeScript strict mode catches entire classes of bugs at compile time. For a compliance tool where correctness is critical, we need maximum type safety.

## Decision
Enable all strict mode options in `tsconfig.base.json`:
- `strict: true`
- `noImplicitOverride: true`
- `noFallthroughCasesInSwitch: true`
- `forceConsistentCasingInFileNames: true`
- `noUncheckedIndexedAccess: false` (too strict for current codebase)
- `verbatimModuleSyntax: false` (allows CommonJS interop)

## Consequences

### Positive
- **Catches bugs early**: Null/undefined errors, missing cases, override mistakes
- **Self-documenting code**: Types serve as documentation
- **Refactoring confidence**: Compiler catches breaking changes
- **IDE support**: Better autocomplete and refactoring

### Negative
- **Verbose types**: More explicit type annotations needed
- **Migration effort**: Existing code may need fixes
- **`noUncheckedIndexedAccess` disabled**: Would require extensive `.??` or `| undefined` handling

## Consequences
- All packages inherit strict mode via `extends: "../../tsconfig.base.json"`
- `pnpm run typecheck` runs `tsc -b tsconfig.json` on all packages
- CI fails on any type error

## Related
- [ADR-001: Monorepo Architecture](./001-monorepo-architecture.md)

## Metadata
- **Date**: 2026-10-11
- **Author**: CompliSME Team