# AI-Assisted Mobile Development Workflow

> **Status:** Draft v0.8 — no staging env; direct-to-prod with rollback; CI/CD pipeline defined

---

## Vision

A development workflow where an AI agent (Claude Code or equivalent) acts as a full-stack development partner on a mobile project — capable of writing code, running tests, rendering the UI, provisioning cloud resources, and iterating across frontend and backend simultaneously. The human developer directs, reviews, and approves; the AI executes and validates.

---

## Core Principles

1. **AI owns the execution loop** — write → test → visualize → iterate, without waiting for human re-prompting at each step.
2. **Cloud-native by default** — no local servers or databases are spun up unnecessarily; cloud services are provisioned with justification.
3. **Full-stack coherence** — frontend and backend share a single project context; API contracts are co-evolved.
4. **Reproducible environments** — a Dev Container definition is generated at bootstrap; every developer and the AI itself runs in an identical environment. No local toolchain assumptions.
5. **Microservice-ready** — multiple backend services can coexist and be worked on independently or together.
6. **High autonomy within hard limits** — the AI acts independently within a pre-approved budget envelope. If no spend cap is configured, the AI **refuses to provision any cloud resources** and halts cloud-dependent work until one is set. Breach of the cap triggers an immediate stop, not a warning.

---

## Workflow Stages

### 1. Project Bootstrap

> **Scope:** Greenfield projects only. Onboarding existing codebases and ejection from this workflow are deferred to a future design phase.

> **Implementation:** The bootstrap process is implemented as a **Claude skill** — a versioned, reusable `CLAUDE.md` instruction set that the AI executes when invoked with `claude bootstrap`. See [`BOOTSTRAP_SKILL.md`](./BOOTSTRAP_SKILL.md) for the full skill definition.

**Inputs:** Product brief, design mockups (optional), service list, cloud subscription details, GitHub token.

The bootstrap phase is the one moment where the human makes several foundational decisions before the AI takes over execution. It is a linear sequence of steps with hard blocking conditions at each gate.

---

#### Bootstrap Sequence

**Step 1 — Human provides seed configuration**

The human fills in a minimal seed file (can be done in conversation with the AI, which then writes it):

```json
// bootstrap-seed.json  — provided by human, not committed to the repo
{
  "project_name": "my-app",
  "cloud": "azure",              // "azure" | "gcp"
  "subscription_id": "...",
  "region": "eastus",
  "services": ["auth", "api", "notifications"],
  "monthly_budget_usd": 150,
  "github": {
    "org": "my-org",             // or personal username
    "visibility": "private"
  }
}
```

⛔ AI blocks if: `project_name`, `cloud`, `monthly_budget_usd`, or `github.org` are missing.

---

**Step 2 — AI creates the GitHub repository**

Using the GitHub API (token from environment):
- Creates the repo under the specified org/user
- Sets the description and visibility
- Protects `main`: requires PR, at least 1 approval (waived for solo developers), no direct push
- Creates branch `bootstrap/init` for all scaffold commits — nothing goes to `main` until the human merges

⛔ AI blocks if: GitHub token is missing, invalid, or lacks `repo` scope.

---

**Step 3 — AI scaffolds the monorepo**

Structure committed to `bootstrap/init`:

```
my-app/
├── .devcontainer/
│   ├── devcontainer.json      ← VS Code / Claude Code dev container config
│   └── Dockerfile             ← container image with all required tooling
├── .github/
│   └── workflows/
│       ├── ci.yml             ← lint, test, Expo web, Android, iOS (macOS runner)
│       └── deploy-staging.yml
├── CLAUDE.md                  ← project-level AI instructions
├── turbo.json                 ← Turborepo task graph
├── package.json               ← workspace root
├── mobile/                    ← React Native (Expo)
│   ├── app/
│   ├── components/
│   └── package.json
├── services/
│   └── <service-name>/        ← one folder per backend service
│       ├── src/
│       ├── tests/
│       ├── Dockerfile         ← runtime image (separate from dev container)
│       ├── openapi.yaml
│       └── package.json
├── shared/                    ← types, utils, API client shared across mobile + services
│   └── package.json
└── infra/
    ├── bootstrap.json         ← derived from seed; committed; no secrets
    ├── budget.json            ← spend cap; committed; enforced by AI before any provisioning
    └── <cloud>/               ← azure/ or gcp/ — Bicep or Terraform files
```

Turborepo is configured with standard tasks: `build`, `test`, `lint`, `dev` — each service and the mobile app participates.

The dev container image includes: Node.js 20, `gh`, `az` or `gcloud` (based on `cloud` field), Terraform or Bicep, Expo CLI, Android SDK + emulator, Playwright (for screenshot capture). The `devcontainer.json` configures port forwarding for Expo web (8081) and Storybook (6006), and mounts the workspace for live editing. iOS Simulator is explicitly excluded — it is macOS-only and handled in CI.

---

**Step 4 — AI outputs resource plan**

Before provisioning anything, the AI produces a human-readable plan:

```
RESOURCE PLAN — my-app (dev environment)
Cloud: Azure | Region: East US | Budget cap: $150/month

Resource                        SKU              Est. $/month
─────────────────────────────────────────────────────────────
Container Apps Environment      Consumption      $0 (idle)
Container App — api             Consumption      ~$5–15
Azure AD B2C                    Free tier        $0 (≤50k MAU)
Azure Key Vault                 Standard         ~$1
Azure Container Registry        Basic            ~$5
─────────────────────────────────────────────────────────────
Estimated total (dev):          ~$11–21/month
Remaining budget headroom:      ~$129–139/month
```

⛔ AI blocks and waits for human approval before applying any cloud resources.

---

**Step 5 — Human approves; AI provisions dev baseline**

On approval, the AI applies the IaC (Bicep/Terraform) for the dev environment baseline only:
- Identity / service principal
- Secrets store
- Container registry
- Any services listed in `bootstrap-seed.json`

Confirms with a health check (can all services be reached?) and posts a summary to the PR.

---

**Step 6 — Human merges `bootstrap/init` → `main`**

From this point, the project follows the standard feature development loop. The bootstrap skill's job is done.

---

**Blocking conditions summary:**

| Condition | AI behaviour |
|---|---|
| `bootstrap-seed.json` missing or invalid fields | Halt, list missing fields, ask human |
| GitHub token missing or insufficient scope | Halt, explain required scopes (`repo`, `workflow`) |
| `monthly_budget_usd` not set | Halt, refuse all cloud steps |
| Cloud credentials not reachable | Halt, provide auth instructions for chosen cloud |
| Resource plan not approved | Halt before any `apply` / CLI command |

---

### 2. Feature Development Loop

This is the core cycle the AI runs for each feature or task:

```
┌─────────────────────────────────────────────────────┐
│                   FEATURE BRIEF                     │
│         (from human, ticket, or spec doc)           │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
          ┌──────────────────┐
          │  Plan & Scaffold  │  ← AI proposes approach, flags unknowns
          └────────┬─────────┘
                   │
         ┌─────────▼──────────┐
         │  Implement (AI)     │  ← Frontend + backend changes together
         └─────────┬──────────┘
                   │
       ┌───────────▼────────────┐
       │  Unit & Integration     │  ← AI writes and runs tests
       │  Tests                  │
       └───────────┬────────────┘
                   │
         ┌─────────▼──────────┐
         │  Run & Visualize    │  ← App rendered in simulator/emulator
         │  (Frontend)         │     or screenshot capture for review
         └─────────┬──────────┘
                   │
         ┌─────────▼──────────┐
         │  Self-Critique &    │  ← AI checks against spec, flags issues
         │  Fix Loop           │
         └─────────┬──────────┘
                   │
                   ▼
          Human review & merge
```

---

### 3. Testing Strategy

| Layer | Type | Tooling (examples) | Run by AI? |
|---|---|---|---|
| Business logic | Unit tests | Jest, XCTest, JUnit | ✅ Yes |
| API contracts | Integration tests | Supertest, Postman/Newman | ✅ Yes |
| Mobile UI | Component tests | React Native Testing Library, XCUITest | ✅ Yes |
| End-to-end | E2E flows | Detox, Maestro | ✅ With simulator |
| Visual regression | Screenshot diff | Applitools, Percy ❓ | ✅ Proposed |

**AI behavior:**
- Tests are written alongside (or before) implementation.
- Failing tests block progression; AI iterates until green.
- Test output is summarized in the PR description or review artifact.

---

### 4. Frontend Visualization

For the AI to "see" the frontend:

- **Simulator/emulator:** AI triggers a build and launch (iOS Simulator or Android Emulator), captures screenshots at key states.
- **Storybook:** Component library rendered in isolation for UI review without a full build.
- **Web preview (if applicable):** React Native Web target for faster iteration.

The AI describes what it sees, compares against spec/mockup, and self-corrects before surfacing to the human.

**Platform: React Native (Expo)**

React Native is chosen over Flutter for this workflow because:
- Expo's web target enables instant UI preview in a browser without a simulator — the fastest feedback loop for AI validation.
- Storybook for React Native is mature and runs on web, allowing component-level visual checks without any native build.
- The JS/TS ecosystem means the AI can share test tooling (Jest, Testing Library) across mobile and backend.

**AI visualization stack (in order of speed):**
1. **Expo web** — instant browser preview, no build step; runs inside the dev container.
2. **Storybook (web target)** — isolated component review; AI captures screenshots and compares to design spec; runs inside the dev container.
3. **Android Emulator** — runs inside the dev container if the host supports KVM; otherwise runs on CI.
4. **iOS Simulator** — requires macOS; never runs in the dev container. Runs exclusively on a GitHub Actions macOS runner as part of the pre-PR CI job.

> **iOS note:** The dev container handles all development and validation up through Android. iOS is validated in CI automatically when the PR is raised — the AI waits for that result before marking the feature complete.

---

### 5. Backend & Microservices

Each backend service lives in `/services/<service-name>/` with its own:
- Source code and dependencies
- Local test runner config
- `Dockerfile` or serverless deployment config
- API spec (OpenAPI / GraphQL schema)

**AI can work on multiple services in one session**, coordinating schema changes that ripple across service boundaries and into the mobile client.

**Service communication patterns supported:**
- REST (OpenAPI contracts)
- GraphQL
- Event-driven (message queues — Azure Service Bus, GCP Pub/Sub) ❓

---

### 6. Cloud Resource Model

The AI operates with **high autonomy** over cloud resources, within the hard budget cap defined in `infra/budget.json` (see [Resource Budget & Spend Cap](#resource-budget--spend-cap)).

The provisioning flow is:

```
AI identifies a need
       │
       ▼
Checks budget.json — cap configured?
  No  → STOP. Block session. Ask human to set a cap.
  Yes → Continue
       │
       ▼
Check current spend vs cap
  At/over 100% → Hard stop (see cap behaviour above)
  90–99%       → Conservative mode, cost note required
  Below 90%    → Proceed autonomously
       │
       ▼
Select smallest viable SKU for environment
Prefer serverless/consumption-tier in dev
       │
       ▼
Apply via IaC (Terraform / Bicep) or CLI
Tag all resources: project, environment, owner, ai-managed
       │
       ▼
Log provisioning event to session summary
```

**Preferred cloud:** Selected by the human during project bootstrap and recorded in `infra/bootstrap.json`. The AI reads this value and uses the appropriate resource templates throughout the project lifecycle.

**Resource categories the AI might request:**

| Category | Azure option | GCP option |
|---|---|---|
| Mobile backend API | Azure Container Apps | Cloud Run |
| Database (relational) | Azure SQL / PostgreSQL Flexible | Cloud SQL |
| Database (document) | Cosmos DB | Firestore |
| Auth ✅ | Azure AD B2C (auto-selected) | Firebase Auth (auto-selected) |
| Push notifications | Azure Notification Hubs | Firebase Cloud Messaging |
| Object storage | Azure Blob Storage | Cloud Storage |
| Message queue | Azure Service Bus | Pub/Sub |
| Secrets | Azure Key Vault | Secret Manager |
| CI/CD | Azure DevOps / GitHub Actions | Cloud Build / GitHub Actions |

---

### 7. CI/CD Pipeline

This workflow uses a **direct-to-production** model. There is no permanent staging environment. The test suite and post-deploy rollback are the safety net.

> **Why no staging?** The testing pyramid (unit → integration → component → E2E → visual) runs before anything merges. The remaining risk — infra/config bugs that only appear in a real deploy — is handled by smoke tests with automatic rollback, which is faster and cheaper than maintaining a parallel environment.

#### On every PR (feature branch → main)

```
Push to feature/*
        │
        ▼
┌───────────────┐
│ Lint & types  │  fast, blocking — must pass to continue
└───────┬───────┘
        │
┌───────▼───────┐
│  Unit tests   │  fast, blocking
└───────┬───────┘
        │
┌───────▼────────────┐
│ Integration tests  │  moderate, blocking
└───────┬────────────┘
        │
┌───────▼────────────┐
│ Component tests    │  moderate, blocking
└───────┬────────────┘
        │
   ┌────┴─────┐
   │          │
┌──▼──┐  ┌───▼──────────┐
│ Expo│  │   Android    │  parallel
│ web │  │   Emulator   │
│ ✦  │  │  (CI runner) │
└──┬──┘  └───┬──────────┘
   │          │
   └────┬─────┘
        │
┌───────▼──────────┐
│  iOS Simulator   │  macOS runner
│  (macos-latest)  │
└───────┬──────────┘
        │
        ▼
   PR can be merged
```

✦ Expo web screenshot is captured via Playwright and uploaded as a CI artifact.

#### On merge to main

```
Merge to main
      │
      ▼
┌─────────────────┐
│  Full test suite │  same as PR — re-runs on merged code
│  (lint→iOS)     │  blocking
└────────┬────────┘
         │
┌────────▼────────┐
│  Build & push   │  container image(s) built and pushed
│  images to      │  to registry
│  registry       │
└────────┬────────┘
         │
┌────────▼────────┐
│  Deploy to      │  IaC apply or rolling update
│  production     │  (Cloud Run / Container Apps)
└────────┬────────┘
         │
┌────────▼────────┐
│  Smoke tests    │  lightweight — is the app alive and auth working?
│  (post-deploy)  │  runs against production endpoints
└────────┬────────┘
         │
    ┌────┴─────┐
    │          │
  Pass        Fail
    │          │
    ▼          ▼
  Done    Auto-rollback to previous image revision
              + alert to human
              + AI opens fix ticket
```

#### Smoke test scope

Smoke tests are intentionally minimal — they verify the deployment is alive, not that features work (that's the pre-merge test suite's job):

- Health check endpoint on each service returns 200
- Auth provider is reachable and token exchange succeeds
- At least one authenticated API call succeeds end-to-end
- Mobile app bundle is served (Expo web / OTA update)

If any smoke test fails, the rollback is automatic. Cloud Run and Azure Container Apps both support revision-based rollback with a single command — CI triggers it immediately without waiting for human input.

#### AI role in CI

The AI monitors CI results as part of the feature skill. Specifically:
- Waits for the PR CI run to complete before marking a feature done
- If CI fails on a feature branch, reads the log, proposes a fix, and iterates — up to 3 times before escalating to the human
- If CI fails on main after merge (rare — indicates a merge interaction bug), opens a `fix/` branch immediately and alerts the human
- Never triggers a manual rollback — that is always a human or automated smoke-test action

---


---

## Resource Budget & Spend Cap

> ⛔ **Hard requirement: no cloud work proceeds without a configured spend cap.**
> If a cap is not set in `infra/budget.json`, the AI will refuse all cloud provisioning and surface a blocking error in the session. This is not advisory — it is enforced before any IaC or CLI command runs.

### Budget Configuration

Caps are stored in a version-controlled file at the root of the infra directory:

```json
// infra/budget.json
{
  "currency": "USD",
  "monthly_cap": 150,
  "alert_thresholds": [50, 75, 90],
  "hard_stop_at_percent": 100,
  "environment": "development",
  "owner": "team@example.com"
}
```

This file must exist and be valid before any `terraform apply`, `az deployment`, or `gcloud` command is issued by the AI. The AI reads and validates it as the first step of any provisioning action.

### Autonomy Tiers

| Spend level (% of cap) | AI behaviour |
|---|---|
| 0–74% | **Full autonomy** — AI provisions, resizes, and tears down dev resources freely |
| 75–89% | **Alert mode** — AI notifies the human, continues but adds cost note to every provisioning action |
| 90–99% | **Conservative mode** — AI only provisions if the resource is strictly required to unblock a failing test or build; defers all optional resources |
| 100% | **Hard stop** — AI halts all cloud work, commits no further IaC changes, opens a blocking issue/message for the human. Development continues only for code changes that require no new cloud resources. |

### What the AI Does at Hard Stop

When the cap is reached:

1. Immediately stops all pending provisioning commands.
2. Rolls back any in-flight IaC that has not yet applied.
3. Outputs a **spend summary**: what was provisioned, estimated cost to date, what triggered the stop.
4. Identifies which pending work is **cloud-blocked** vs **can continue offline** (pure logic, unit tests, frontend scaffolding).
5. Suggests specific resources to tear down or downsize to recover headroom, with estimated savings.
6. Waits for human to either raise the cap in `budget.json` or approve teardowns before resuming.

### Cost Hygiene Rules (Always On)

These apply regardless of spend level:

- **Dev resources use the smallest viable SKU** — no production-tier instances in development environments.
- **Idle teardown:** any cloud resource unused for 48 hours in a dev environment is flagged for teardown; the AI acts on it automatically unless the human objects.
- **No data egress surprises:** before provisioning anything with per-GB egress costs, the AI estimates expected data transfer and includes it in the cost note.
- **Tagging required:** every provisioned resource is tagged `project`, `environment`, `owner`, and `ai-managed: true` to enable cost filtering in the cloud console.
- **Prefer serverless/consumption-tier** for dev: Cloud Run (min instances = 0), Cosmos DB serverless, Firebase Spark plan where feasible — cost is $0 when idle.

## Open Questions

| # | Question | Why it matters |
|---|---|---|
| ~~❓1~~ | ~~Mobile platform?~~ | ✅ Resolved: React Native (Expo) — hybrid iOS + Android; best AI validation story via web/Storybook preview |
| ~~❓2~~ | ~~Preferred cloud?~~ | ✅ Resolved: decided at project bootstrap by the human; AI adapts resource templates accordingly |
| ~~❓3~~ | ~~Monorepo tool?~~ | ✅ Resolved: Turborepo — lowest friction for small JS/TS teams, native Expo pairing, CI caching built in |
| ~~❓4~~ | ~~Auth strategy?~~ | ✅ Resolved: third-party only — Firebase Auth (GCP) or Azure AD B2C (Azure); selected automatically based on `cloud` in `bootstrap.json` |
| ~~❓5~~ | ~~How much autonomy should AI have?~~ | ✅ Resolved: high autonomy within spend cap; hard stop at 100% |
| ~~❓6~~ | ~~Existing codebase or greenfield?~~ | ✅ Resolved: greenfield only for now; onboarding/ejection to be designed separately |
| ❓7 | Team size and branching model? | Shapes PR review workflow |

---

## Next Steps

- [x] Draft the Bootstrap skill (`BOOTSTRAP_SKILL.md`)
- [x] Draft the Feature Development skill (`FEATURE_SKILL.md`)
- [x] Define the project-level `CLAUDE.md` template (`CLAUDE.md.template`)
- [x] Discuss staging and production environment strategy — no staging, direct-to-prod with rollback
- [ ] Draft CI/CD workflow templates (`ci.yml`, `deploy-prod.yml`)
- [ ] Draft end-to-end feature walkthrough
- [ ] Choose a pilot project to validate the workflow

## Future Work (Out of Scope Now)

- **Onboarding existing projects** into this workflow (migration guide, partial adoption path)
- **Ejecting** from the workflow (removing AI tooling while keeping the project healthy)
- **Multi-developer collaboration** patterns — how multiple humans + AI agents coordinate on the same repo
- **Production hardening** — the workflow currently focuses on dev/staging; prod deployment governance is a separate concern

---

*Document owner: TBD | Last updated: 2026-06-14 | v0.8*
