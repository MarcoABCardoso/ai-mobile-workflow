# AI Mobile Workflow

A reusable workflow for building React Native mobile apps with full AI autonomy — from project creation to feature development, testing, and production deployment.

Designed for use with [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Reference this repo in a Claude Code session and invoke skills directly.

---

## Quickstart

### 1. Reference this repo in Claude Code

```bash
claude --context https://github.com/<org>/ai-mobile-workflow
```

Or add it to your Claude Code project context. Claude will read `CLAUDE.md` and know what skills are available.

### 2. Bootstrap a new project

```
claude bootstrap
```

Claude will ask you to fill in a seed file, then:
- Create a GitHub repo
- Scaffold a React Native (Expo) + Turborepo monorepo
- Set up a dev container
- Generate a cloud resource plan (Azure or GCP)
- Provision your dev environment
- Open a bootstrap PR

### 3. Develop features

```
claude feature "user can sign in and view a list of items"
```

Claude will implement the feature across mobile and backend, write and run tests, capture screenshots, and open a PR — without you writing a line of code.

---

## What's included

```
ai-mobile-workflow/
├── CLAUDE.md                  ← Claude Code reads this first in every session
├── README.md                  ← You are here
├── skills/
│   ├── BOOTSTRAP_SKILL.md     ← Full bootstrap instructions for Claude
│   └── FEATURE_SKILL.md       ← Full feature development instructions for Claude
├── templates/
│   ├── CLAUDE.md.template     ← Generated into every project at bootstrap
│   ├── ci.yml                 ← GitHub Actions CI (lint → test → screenshots → iOS)
│   ├── deploy-prod.yml        ← GitHub Actions deploy (test → build → deploy → smoke → rollback)
│   └── smoke-tests.js         ← Post-deploy smoke test script
└── docs/
    ├── workflow.md             ← Full workflow documentation
    └── decisions/             ← Architecture Decision Records
        ├── 001-react-native.md
        ├── 002-turborepo.md
        ├── 003-no-staging.md
        └── 004-third-party-auth.md
```

---

## Tech stack

| Layer | Choice | Reason |
|---|---|---|
| Mobile | React Native (Expo) | Expo web enables instant AI preview without a simulator |
| Monorepo | Turborepo | Lowest friction for small JS/TS teams; native Expo pairing |
| Cloud | Azure or GCP | Selected per project at bootstrap |
| Auth | Firebase Auth / Azure AD B2C | Battle-tested; no custom auth logic required |
| IaC | Terraform (GCP) / Bicep (Azure) | Generated at bootstrap; applied by AI |
| CI/CD | GitHub Actions | Direct-to-prod with automatic rollback on smoke test failure |
| Dev environment | Dev Containers | Every developer and Claude run identically |

---

## Design principles

1. **AI owns the execution loop** — write → test → visualize → PR, without waiting for human re-prompting
2. **Cloud-native by default** — no local servers; dev resources provisioned on demand
3. **Hard spend cap** — AI refuses all cloud work if `infra/budget.json` is missing or cap is reached
4. **Full-stack coherence** — mobile and backend developed together in one session
5. **Reproducible environments** — dev container means zero local toolchain setup
6. **No staging** — strong pre-merge tests + post-deploy rollback replace a staging environment

---

## Requirements

To use this workflow you need:

- Claude Code installed
- Docker (for the dev container)
- A GitHub account with a token scoped to `repo`, `workflow`, `read:org`
- An Azure subscription **or** a GCP project with billing enabled
- A spend cap you're comfortable with (set during bootstrap)

---

## Status

**v0.8** — workflow documented, skills drafted, CI/CD templates complete.
End-to-end feature walkthrough and IaC starter templates are in progress.
See [`docs/workflow.md`](docs/workflow.md) for full detail.

---

## Contributing

This workflow is designed to evolve. If you find a gap while using it on a pilot project, open an issue or PR — especially if the feature skill fails to handle a case cleanly.
