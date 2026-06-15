# Claude Code Handoff — AI Mobile Workflow

This file brings a new Claude Code session up to speed on the work done so far.
Read this file in full before doing anything else.

---

## What this project is

A reusable workflow definition for building React Native mobile apps with full AI autonomy.
It lives in a GitHub repository and is invoked from Claude Code sessions on other projects.

The workflow repo contains:
- `CLAUDE.md` — root AI instructions (the primary reference going forward)
- `skills/BOOTSTRAP_SKILL.md` — how to create a new project
- `skills/FEATURE_SKILL.md` — how to implement a feature end-to-end
- `templates/` — files generated into every project at bootstrap
- `docs/workflow.md` — full workflow documentation
- `docs/decisions/` — ADRs 001–004

---

## Current status — v0.8

### Done
- [x] Full workflow document (`docs/workflow.md`)
- [x] Bootstrap skill (`skills/BOOTSTRAP_SKILL.md`)
- [x] Feature skill (`skills/FEATURE_SKILL.md`)
- [x] Project-level `CLAUDE.md` template (`templates/CLAUDE.md.template`)
- [x] CI workflow (`templates/ci.yml`)
- [x] Production deploy workflow (`templates/deploy-prod.yml`)
- [x] Smoke test script (`templates/smoke-tests.js`)
- [x] ADRs 001–004 (`docs/decisions/`)
- [x] Root `CLAUDE.md` and `README.md`
- [x] Git repo initialised, committed, ready to push

### Remaining work
These are the next items to complete before the workflow is ready for a pilot project:

1. **Push to GitHub** — run `./push-to-github.sh https://github.com/YOUR-ORG/ai-mobile-workflow.git`

2. **Wire CI artifact paths into the feature skill** — the feature skill waits for CI results
   (iOS screenshots, test output) but doesn't yet specify exact artifact names/paths to look for.
   These should match what `templates/ci.yml` uploads.

3. **IaC starter templates** — `infra/azure/dev/main.bicep` and `infra/gcp/dev/main.tf`
   don't exist yet. Need working baselines for each cloud covering:
   identity, secrets store, container registry, auth provider, one Container App / Cloud Run service.

4. **Auth provider setup in bootstrap skill** — Step 5 references provisioning Azure AD B2C /
   Firebase but doesn't specify the exact CLI commands.

5. **Bootstrap skill: template substitution** — Step 3 should explicitly show how
   `templates/` files are copied and `{{placeholders}}` substituted.

6. **End-to-end feature walkthrough** — best done against the pilot project once pushed.

---

## Key decisions already made

| Decision | Choice |
|---|---|
| Mobile platform | React Native (Expo) |
| Monorepo tooling | Turborepo |
| Staging environment | None — direct to prod with automatic rollback |
| Auth | Firebase Auth (GCP) / Azure AD B2C (Azure) |
| Cloud platform | Selected per project at bootstrap (Azure or GCP) |
| Branching model | Trunk-based (feature branches → main) |
| Event-driven messaging | REST only for now |
| Visual regression | Manual screenshot review in PRs |
| Dev environment | Dev Containers (no Loft Labs yet) |
| iOS Simulator | CI only (GitHub Actions macOS runner) |

---

## Hard rules — do not override these

- No staging environment (ADR 003)
- No custom auth logic (ADR 004)
- No direct push to `main`
- Always check `infra/budget.json` before any cloud action
- Dev container is the environment — iOS on CI only
- Greenfield projects only

---

## Suggested first actions in this session

1. Read `skills/BOOTSTRAP_SKILL.md` and `skills/FEATURE_SKILL.md` in full
2. Push the repo: `./push-to-github.sh <remote-url>`
3. Work through remaining items 2–6 above in order

---

*Handoff from claude.ai session | Workflow v0.8 | 2026-06-14*
