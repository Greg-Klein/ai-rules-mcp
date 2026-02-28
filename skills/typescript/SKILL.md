---
name: typescript-strict
description: TypeScript strict mode conventions and type safety rules
patterns:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.mts"
tags: [typescript, types, strict]
priority: high
---

## Strict Configuration

Always enable: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.

## Type Safety Rules

- **Never use `any`** — use `unknown` and narrow with type guards.
- Prefer `as const` assertions over type annotations for literal values.
- Use discriminated unions over optional properties for variant types.
- Always handle `null` and `undefined` explicitly — no non-null assertions (`!`).
- Use `satisfies` operator to validate types without widening.

## Anti-patterns

- ❌ `any` — even in catch blocks, use `unknown`.
- ❌ Type assertions (`as X`) to silence errors — fix the types instead.
- ❌ `@ts-ignore` without a linked issue.
- ❌ `enum` with computed values — use `as const` objects instead.
