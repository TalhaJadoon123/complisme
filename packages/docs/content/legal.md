---
title: Legal and scope
order: 7
description: What the output is, what it is not, and where the liability sits.
---

# Legal and scope

## Not legal advice

CompliSME produces compliance working documents from information you provide. Every generated document carries a notice to that effect. Have the output reviewed by a qualified lawyer or data protection officer before relying on it, and keep it current as your processing changes.

The tool is decision support. It tells you what the regulation requires, what your answers imply, and what you still need to do. It cannot tell you whether your particular facts amount to compliance.

## What we do not do

- We do not file anything with a regulator.
- We do not send correspondence on your behalf.
- We do not give a guarantee of compliance.
- We do not assess jurisdiction-specific employment, tax or sectoral law beyond the four frameworks covered.

## Data handling

**Your code.** The scanner is local. It reads files and nothing else.

**Your company data.** Stored in your database. With an LLM key configured, the company name is pseudonymised and direct identifiers — emails, phone numbers, national identifiers, card numbers, IP addresses, VAT numbers, postcodes — are stripped before a prompt is built. Prompts are also truncated to a token budget.

**Without an LLM key**, nothing leaves your infrastructure. The entire rules-based product — scoring, gaps, roadmap, document generation — runs locally.

**Payments.** Card details are handled by your payment provider. CompliSME stores only provider identifiers.

## Regulatory accuracy

The framework definitions were written from the published regulations and the Commission/EFRAG guidance available at the time of writing. Regulation changes: the Omnibus simplification, the AI Act service desk guidelines, national CSRD transpositions and ViDA delegated acts are all still moving. Check a citation before you put it in front of a regulator.

The definitions are open source precisely so that this is fixable by anyone with the expertise, without waiting for a vendor.

## Security

Passwords are hashed with scrypt (N=16384) with a per-user salt. Session tokens are HMAC-SHA256 signed and expire in seven days. API keys are stored as SHA-256 hashes with only the prefix retained.

The server ships `helmet` security headers, CORS configuration and rate limiting. You are responsible for TLS termination and for not running with the default `AUTH_SECRET`, which the API warns about on startup.

## Framework content licence

The framework YAML definitions are MIT-licensed, like the rest of the repository. Correct them, fork them, remove the parts you do not need.

## Contact

Support questions and correction requests belong in the repository issue tracker. For a framework definition you believe is wrong, a pull request with the corrected citation is the fastest route to a fix.