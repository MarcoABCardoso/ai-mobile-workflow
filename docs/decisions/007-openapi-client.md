# ADR 007 — openapi-typescript + openapi-fetch for the shared API client

**Status:** Accepted  
**Date:** 2026-06-15

## Context

Mobile and backend share a contract. That contract lives in the OpenAPI spec generated from Fastify route schemas (ADR 005). Something has to turn that spec into TypeScript types the mobile app can consume when making HTTP requests.

## Decision

**`openapi-typescript`** to generate types from the spec, and **`openapi-fetch`** as the typed HTTP client in `shared/api-client/`.

## Reasons

- **Thin.** `openapi-typescript` generates a single `.d.ts` file of path/method/request/response types. `openapi-fetch` is a ~2 kB wrapper around `fetch` that consumes those types. Together they add almost nothing to bundle size.
- **Spec-driven.** Types are always derived from the generated `openapi.yaml` — never written by hand. If a route changes in Fastify, the spec changes, the types change, and the mobile app gets a compile error. This is the correct failure mode.
- **No codegen runtime.** Unlike SDK generators (openapi-generator, Orval), there is no generated class hierarchy or interceptor framework to maintain. The shared package is just types + one client instance.
- **Well-established.** `openapi-typescript` is widely used in the TypeScript community and actively maintained.

## What this means in practice

The type generation pipeline runs in the `shared/api-client` workspace:

```
Fastify route schemas
        ↓  (npm run generate:openapi in service)
  openapi.yaml  (committed, build artifact)
        ↓  (npm run generate:types in shared/api-client)
  src/generated/types.d.ts  (committed, build artifact)
        ↓  (imported by mobile via shared package)
  openapi-fetch client with full path/method/body/response types
```

Concretely:
- `shared/api-client/package.json` has a `generate` script: `openapi-typescript ../services/<name>/openapi.yaml -o src/generated/types.d.ts`
- `shared/api-client/src/index.ts` exports one `createClient<paths>` instance per service
- Mobile imports `import { apiClient } from '@<project>/api-client'` — no raw `fetch` calls in mobile code
- `turbo run generate` regenerates all specs and types in dependency order

## Trade-offs

- Two-step generation (spec, then types) means a route change requires running two commands before the mobile build will pass. The `turbo run generate` script handles this in one command.
- `openapi-fetch` is less full-featured than Axios (no interceptors, no retry). TanStack Query (ADR 008) handles retry and caching on the mobile side; simple request logic lives in the client wrapper.

## Alternatives considered

- **tRPC** — type safety without a spec file; excellent DX but requires the backend to use tRPC router instead of Fastify. Ruled out because it ties the mobile client to the backend runtime (no REST contract, no non-JS consumers).
- **Orval / openapi-generator** — richer SDK generation. Ruled out because generated class-based SDKs are harder for AI to produce and review correctly, and the generated code surface area is much larger.
- **Hand-written types** — rejected. Types would drift from the implementation immediately.
