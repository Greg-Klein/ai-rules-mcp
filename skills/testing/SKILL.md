---
name: testing
description: Testing best practices — unit, integration, and E2E
patterns:
  - "**/*.test.*"
  - "**/*.spec.*"
  - "**/__tests__/**"
tags: [testing, test, vitest, jest, quality]
priority: high
---

## Principles

- **Test behavior, not implementation.** Tests should survive refactors.
- Follow **Arrange → Act → Assert** (AAA).
- Each test should be independent — no shared mutable state.
- Test names should read like specs: `"should reject expired tokens"`.

## Mocking

- Mock at the boundary (HTTP, DB) — never mock the unit under test.
- Prefer dependency injection over module mocking.
- Reset mocks between tests: `vi.restoreAllMocks()`.

## Anti-patterns

- ❌ Testing private methods directly.
- ❌ Snapshot tests for complex objects.
- ❌ `sleep()` or fixed timeouts — use `waitFor` or fake timers.
