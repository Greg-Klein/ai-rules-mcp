---
name: react
description: React best practices, patterns, and common pitfalls
patterns:
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/components/**"
  - "**/hooks/**"
tags: [react, frontend, ui, components]
priority: high
---

## Component Design

- Prefer **functional components** with hooks over class components.
- Keep components small and focused — one responsibility per component.
- Extract reusable logic into **custom hooks** (`useXxx`).
- Co-locate related files: `Button.tsx`, `Button.test.tsx`, `Button.module.css`.

## State Management

- Use `useState` for local UI state, `useReducer` for complex state logic.
- Lift state only as high as necessary — avoid prop drilling by using composition.
- For shared state, prefer **React Context** or a lightweight store (Zustand, Jotai).

## Performance

- Memoize expensive computations with `useMemo`, callbacks with `useCallback`.
- Use `React.memo()` only when profiling shows unnecessary re-renders.
- Use `key` props correctly: stable, unique identifiers — never array index for dynamic lists.

## Anti-patterns

- ❌ `useEffect` for derived state — compute during render instead.
- ❌ Fetching in `useEffect` without cleanup — use React Query, SWR, or `use()`.
- ❌ Deeply nested ternaries in JSX — extract to named sub-components.
