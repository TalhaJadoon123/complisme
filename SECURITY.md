# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x.x   | ✅ Yes    |
| < 1.0   | ❌ No     |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please report them via email to **security@complisme.eu** or through GitHub's private vulnerability reporting feature.

### What to Include
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)
- Your contact information

### Response Timeline
- **Acknowledgment**: Within 48 hours
- **Initial Assessment**: Within 5 business days
- **Fix Timeline**: Depends on severity (Critical: 7 days, High: 14 days, Medium: 30 days, Low: 60 days)

## Security Architecture

### Authentication & Authorization
- JWT tokens (HMAC-SHA256) with 32-byte `AUTH_SECRET`
- Passwords: Argon2id via `@node-rs/argon2` with per-user salts
- API keys: SHA-256 hashed at rest, constant-time comparison
- CORS restricted to configured origins

### Tenant Isolation
- Session users pinned to their own company
- Foreign `companyId` in path/query/body/header ignored
- Integration keys must explicitly name tenant via `x-company-id`

### Input Validation
- All external boundaries validated with Zod schemas
- Path traversal protection: `resolveWithin()` + realpath re-check
- LLM prompt injection protection: `<company_context>` delimiters

### Rate Limiting
- Global budget: 300 req/min
- Per-route budgets: AI (20), Scan (10), Generate (15), Publish (10), Preview (20)

### Data Handling
- Codebase read locally, never uploaded
- Company data pseudonymized before LLM prompts
- Evidence stored locally; user controls retention

## Security Best Practices for Users

### Production Deployment
1. Generate strong `AUTH_SECRET`: `openssl rand -hex 32`
2. Use PostgreSQL in production (not in-memory store)
3. Configure `API_CORS_ORIGIN` to your domain only
4. Use HTTPS in production
5. Set up monitoring and alerting

### API Keys
- Use `API_STATIC_KEYS` for machine-to-machine communication
- Rotate keys periodically
- Use least-privilege keys when possible

### LLM Keys
- Use dedicated API keys for CompliSME
- Monitor usage and costs
- Set rate limits appropriate for your usage

## Compliance

CompliSME helps you achieve compliance with:
- EU AI Act (Regulation (EU) 2024/1689)
- GDPR (Regulation (EU) 2016/679)
- CSRD/ESRS (Directive (EU) 2022/2464)
- E-invoicing (ViDA + NF-e/NFS-e)

## Security Audit

We run automated security checks in CI:
- Dependency vulnerability scanning (0 reachable CVEs required)
- Secret scanning (custom scanner)
- Security posture verification (auth gate, tenant isolation, rate limits)
- Static analysis via TypeScript strict mode

## Responsible Disclosure

We appreciate security researchers who help keep CompliSME safe. We commit to:
- Responding promptly to reports
- Coordinating disclosure timeline
- Crediting researchers (unless anonymity requested)
- Providing fixes in a timely manner

## Contact

- Security Email: security@complisme.eu
- GitHub Security Advisories: Private vulnerability reporting
- General Contact: hello@complisme.eu