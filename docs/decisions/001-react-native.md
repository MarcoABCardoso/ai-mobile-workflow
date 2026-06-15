# ADR 001 — React Native (Expo) as the mobile platform

**Status:** Accepted  
**Date:** 2026-06-14

## Context

The workflow needed a single mobile platform that supports both iOS and Android, and that an AI agent can validate visually without requiring a native build every iteration.

## Decision

React Native with Expo (bare workflow).

## Reasons

- **Expo web target** enables instant browser preview with no build step — the fastest possible AI validation loop. The AI can capture a screenshot via Playwright in seconds, not minutes.
- **Storybook for React Native** runs on web, giving isolated component previews without a simulator.
- **JS/TS ecosystem** means shared test tooling (Jest, Testing Library) across mobile and backend services.
- **Expo + Turborepo** is a well-documented pairing with active community support.
- iOS Simulator and Android Emulator are still used for native validation, but only after the faster web-based checks pass.

## Trade-offs

- React Native has a performance ceiling below truly native apps for graphics-intensive use cases. Acceptable for typical business mobile apps.
- Expo bare workflow adds some complexity vs. managed workflow, but is necessary for the dev container setup and native module flexibility.

## Alternatives considered

- **Flutter** — strong cross-platform story but Dart ecosystem is separate from the JS/TS backend stack, and AI web preview story is weaker.
- **Native iOS + Android** — maximum performance and platform fidelity but doubles the implementation surface and eliminates the shared test tooling benefit.
