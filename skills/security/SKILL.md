---
name: security
description: Security rules and OWASP best practices — always active
patterns: []
tags: [security, owasp, auth, xss, injection]
priority: high
always: true
---

## Input Validation

- **Never trust user input.** Validate server-side regardless of client validation.
- Parameterize all SQL queries — no string concatenation.

## Auth

- Hash passwords with **bcrypt** or **argon2**.
- Use short-lived JWTs with refresh token rotation.
- Authorization checks at the API layer, not just UI.

## Frontend

- Sanitize HTML from external sources (DOMPurify).
- Never store secrets in `localStorage` — use `httpOnly` cookies.

## Dependencies

- Run `npm audit` / `yarn audit` in CI — block on critical vulnerabilities.
- Pin major versions. Remove unused dependencies regularly.
