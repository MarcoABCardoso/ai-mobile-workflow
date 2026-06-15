# ADR 009 — Vitest (services) + Jest / jest-expo (mobile)

**Status:** Accepted  
**Date:** 2026-06-15

## Context

The monorepo has two distinct testing environments: Node.js backend services and React Native mobile. These environments have different requirements and the optimal test runner differs between them.

## Decision

- **Backend services:** Vitest
- **Mobile:** Jest with `jest-expo` preset

Each workspace configures its own test runner. `turbo run test` runs both.

## Reasons

**Vitest for services:**
- Faster than Jest for Node.js workloads — no Babel transform, native ESM support, and a faster file watcher.
- Configuration is minimal: one `vitest.config.ts` per service.
- `describe` / `it` / `expect` API is identical to Jest, so switching is seamless.
- First-class TypeScript support without `ts-jest`.
- Integration tests use Fastify's `inject()` method, which works identically under Vitest.

**Jest + `jest-expo` for mobile:**
- React Native requires native module mocking (gesture handler, AsyncStorage, etc.). `jest-expo` configures all of this automatically.
- `@testing-library/react-native` is built and tested against Jest. Running it under Vitest requires manual shim work that is fragile and not officially supported.
- The Expo team maintains `jest-expo` and keeps it in sync with each Expo SDK release — less friction than maintaining custom Vitest shims.

## What this means in practice

**Per service:**
```
vitest.config.ts      — { test: { globals: true, environment: 'node' } }
package.json          — "test": "vitest run", "test:watch": "vitest"
```

Vitest integration tests use Fastify's `app.inject()`:
```typescript
import { describe, it, expect, beforeAll } from 'vitest'
import { app } from '../src/index'

describe('POST /items', () => {
  beforeAll(() => app.ready())
  it('returns 201 with valid payload', async () => {
    const res = await app.inject({ method: 'POST', url: '/items', payload: { name: 'x' } })
    expect(res.statusCode).toBe(201)
  })
})
```

**Mobile workspace:**
```
jest.config.ts        — { preset: 'jest-expo' }
package.json          — "test": "jest --passWithNoTests"
```

Component tests use React Native Testing Library as before.

## What the AI must not do

- Never configure Vitest in the mobile workspace.
- Never configure Jest in a backend service workspace.
- Never add `@types/jest` to a service workspace — use Vitest's `globals: true` instead.

## Trade-offs

- Two test runners in one monorepo is slightly more cognitive overhead for contributors. The trade-off is accepted because each runner is correct for its environment and the `turbo run test` command abstracts the difference.
- Coverage reporting uses different tools (Vitest's built-in c8/v8 for services, Jest's coverage for mobile). This is acceptable for the current workflow; unified coverage reports are a future concern.

## Alternatives considered

- **Vitest everywhere** — desirable for uniformity but blocked by React Native's dependency on Jest-specific module mocking. Not viable without significant custom shim maintenance.
- **Jest everywhere** — works but Jest is slower than Vitest for Node.js services, and its ESM support has historically required additional configuration (`ts-jest`, babel transforms).
