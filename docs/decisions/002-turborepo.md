# ADR 002 — Turborepo as monorepo tooling

**Status:** Accepted  
**Date:** 2026-06-14

## Context

The project structure is a monorepo containing a React Native app, one or more Node.js backend services, and shared packages. Build caching and task orchestration are needed to keep CI fast as the project grows.

## Decision

Turborepo.

## Reasons

- **Lowest friction** for small JS/TS teams — works on top of existing `package.json` scripts with minimal config.
- **Native Expo pairing** — Expo's own documentation uses Turborepo as the recommended monorepo tool.
- **CI caching** works out of the box with GitHub Actions via Turborepo's remote cache.
- **Task graph** (`turbo.json`) makes the build/test/lint dependency order explicit and machine-readable.

## Trade-offs

- Less powerful than Nx for large teams needing fine-grained code ownership or custom generators. Not a concern for teams of ≤ 3.

## Alternatives considered

- **Nx** — more feature-rich but brings a steeper learning curve and its own conventions. Overkill for this team size.
- **Plain workspaces (no tool)** — works initially but loses build caching, making CI progressively slower as the project grows.
