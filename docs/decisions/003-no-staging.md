# ADR 003 — No permanent staging environment

**Status:** Accepted  
**Date:** 2026-06-14

## Context

Decided whether to provision a staging environment between development and production.

## Decision

No permanent staging environment. Deploy directly to production on merge to main, with post-deploy smoke tests and automatic rollback on failure.

## Reasons

- **The test pyramid is the real safety net.** Unit, integration, component, E2E, and visual checks all run before anything merges. If these pass, confidence in the build is high.
- **Staging's unique value is narrow.** The one thing tests can't replicate is real cloud infrastructure behaviour — misconfigured IAM, secrets store connectivity, containers that build but fail to start. Smoke tests against production catch this within seconds of deploy.
- **Rollback is fast.** Cloud Run and Azure Container Apps both support revision-based rollback with a single command, triggered automatically by the CI pipeline if smoke tests fail.
- **Cost and maintenance.** A permanent staging environment doubles cloud spend and requires ongoing maintenance (keeping it in sync with prod config, rotating secrets, etc.). For a small team this is real overhead.

## Trade-offs

- Production is the first environment where real infrastructure behaviour is observed. This is mitigated by smoke tests and fast rollback, but a brief outage window is possible if smoke tests don't catch everything.
- Some compliance frameworks require a staging environment. This workflow does not currently target regulated industries.

## Revisit if

- The team grows and deploy frequency increases to the point where production incidents from infra bugs become common.
- A compliance requirement mandates pre-production validation.
- A feature requires load or performance testing before going live.
