# Contributing to CompliSME

Thank you for your interest in contributing! This document outlines the process for contributing to CompliSME.

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## How to Contribute

### Reporting Bugs
1. Check existing issues first
2. Create a new issue with:
   - Clear title and description
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details (OS, Node version, etc.)

### Suggesting Features
1. Open an issue with the "enhancement" label
2. Describe the use case and expected behavior
3. Explain why this would benefit users

### Code Contributions

#### Prerequisites
- Node.js ≥20.10
- pnpm ≥9 (`corepack enable`)
- Git

#### Setup
```bash
git clone https://github.com/TalhaJadoon123/complisme.git
cd complisme
pnpm install --frozen-lockfile --ignore-scripts
pnpm run build
```

#### Development Workflow
1. Create a feature branch: `git checkout -b feature/your-feature-name`
2. Make your changes
3. Run tests: `pnpm test`
4. Run type check: `pnpm run typecheck`
5. Run security checks: `pnpm run security:posture`
6. Commit with conventional commits: `git commit -m "feat: your feature description"`
7. Push and create a Pull Request

#### Commit Message Format
We use [Conventional Commits](https://www.conventionalcommits.org/):
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `refactor:` - Code refactoring
- `test:` - Adding tests
- `chore:` - Maintenance tasks
- `security:` - Security improvements

#### Testing Requirements
- All existing tests must pass
- New features require tests
- Coverage thresholds must be maintained (core ≥80%)
- Security posture checks must pass

#### Code Style
- TypeScript strict mode
- ESLint/Prettier (if configured)
- No `any` in core packages
- Zod schemas for all external boundaries

### Pull Request Process
1. Ensure all CI checks pass
2. Update documentation if needed
3. Request review from maintainers
4. Address feedback
4. Squash and merge when approved

## Development Guidelines

### Monorepo Structure
```
packages/
  shared/       # Domain types, schemas, utilities
  frameworks/   # Regulatory definitions
  core/         # Compliance engine
  generator/    # Document generation
  scanner/      # Codebase scanning
  llm/          # LLM integration
  cli/          # Command line interface
  api/          # REST API
  desktop/      # Desktop GUI
  web/          # Next.js web app
  docs/         # Documentation site
```

### Dependency Direction
```
shared → frameworks → core → {generator, scanner, llm} → {cli, api} → {web, docs}
                    ↘ desktop
```

### Adding New Framework Definitions
1. Add YAML file to `packages/frameworks/definitions/`
2. Follow existing schema structure
3. Run `pnpm --filter @complisme/frameworks run build`
4. Add tests in `packages/frameworks/tests/`

### Adding New Document Templates
1. Add template in `packages/generator/src/templates/`
2. Register in `packages/generator/src/index.ts`
3. Add CLI command in `packages/cli/src/commands/generate.ts`
4. Add tests

### Security Considerations
- Never commit secrets or credentials
- Run `pnpm run scan:secrets` before committing
- Follow OWASP guidelines
- Report security issues privately (see SECURITY.md)

## Recognition

Contributors are recognized in:
- GitHub contributors page
- Release notes
- Project README (for significant contributions)

## Questions?

Open a GitHub issue or start a discussion.