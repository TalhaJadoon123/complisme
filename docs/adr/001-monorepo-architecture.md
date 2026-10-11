# ADR-001: Monorepo Architecture with pnpm Workspaces

## Status
Accepted

## Context
CompliSME is a multi-package TypeScript project with 12 interdependent packages. We need a build system that:
- Enforces dependency direction (no cycles)
- Supports incremental builds
- Provides good developer experience
- Works well in CI/CD

Alternatives considered:
1. **Single package** - Would couple unrelated concerns, harder to maintain
2. **Multiple repos** - Versioning nightmare, cross-repo refactoring pain
3. **npm workspaces** - Basic, no dependency graph visualization
4. **Yarn workspaces** - Good but pnpm has better performance and disk efficiency
5. **Turborepo** - Great but adds complexity; pnpm's built-in features sufficient

## Decision
Use **pnpm workspaces** with TypeScript project references for the monorepo structure.

## Consequences

### Positive
- **Strict dependency direction**: `shared → frameworks → core → {generator,scanner,llm} → {cli,api} → {web,docs}` with `desktop` on `api`
- **Incremental builds**: `tsc -b` only rebuilds changed packages
- **Disk efficient**: pnpm's content-addressable store shares dependencies
- **Fast installs**: pnpm is significantly faster than npm/yarn
- **Locked versions**: `packageManager` field enforces pnpm 9.15.9
- **Overrides**: Security patches via `pnpm.overrides` (7 packages pinned)

### Negative
- **Learning curve**: Team must understand project references
- **Build complexity**: `tsc -b` requires proper `references` configuration
- **Tool support**: Some IDEs need configuration for project references

### Neutral
- **Migration cost**: Existing codebase already structured this way

## Implementation Notes
- Each package has `tsconfig.json` extending `tsconfig.base.json`
- `references` array in each `tsconfig.json` declares dependencies
- `pnpm-workspace.yaml` defines workspace packages
- Root `package.json` has `packageManager: "pnpm@9.15.9"`
- Build order enforced via `build:node` script with explicit `--filter` order

## Related
- [ADR-002: TypeScript Strict Mode](./002-typescript-strict-mode.md)
- [ADR-003: Repository Pattern for Database](./003-repository-pattern.md)

## Metadata
- **Date**: 2026-10-11
- **Author**: CompliSME Team
- **Reviewers**: Architecture Team