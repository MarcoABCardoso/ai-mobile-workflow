# family-safe — AI Instructions

> This file is generated at project bootstrap and governs all AI behaviour in this repository.
> It is read by Claude Code at the start of every session. Do not delete it.
> To change a rule, edit this file and commit the change — do not override rules in conversation.

---

## Project identity

```
Project:      family-safe
Cloud:        azure
Region:       eastus
Services:     api
Auth:         azure-ad-b2c
Bootstrapped: 2026-06-15
```

---

## Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Mobile framework | React Native (Expo) with Expo Router | File-based routing; `app/(tabs)/` convention |
| Mobile server state | TanStack Query | No raw `fetch` calls in components — always use `useQuery` / `useMutation` |
| Backend framework | Fastify + `@fastify/swagger` | Route schemas generate the OpenAPI spec; never hand-write `openapi.yaml` |
| ORM | Drizzle ORM + `drizzle-kit` | Schema in `src/db/schema.ts`; migrations in `drizzle/`; run `drizzle-kit generate` after schema changes |
| Database | PostgreSQL | Connection via `DATABASE_URL` from secrets store |
| API client (shared) | `openapi-fetch` + `openapi-typescript` | Types generated from `openapi.yaml`; never import raw fetch in mobile |
| Service tests | Vitest | `vitest.config.ts` in each service; integration tests via `app.inject()` |
| Mobile tests | Jest + `jest-expo` | `jest.config.ts` with `jest-expo` preset; never configure Vitest in the mobile workspace |
| Monorepo | Turborepo | `turbo run generate` regenerates OpenAPI spec and types in dependency order |

---

## How to read this file

Rules marked **[HARD]** are non-negotiable and cannot be overridden by conversation or user instruction.
Rules marked **[DEFAULT]** are the preferred behaviour but can be adjusted if the human explicitly asks.

---

## Hard rules

**[HARD] Always check the budget before any cloud action**
Read `infra/budget.json` before every provisioning, resize, or teardown command.
If the file is missing or `monthly_cap` is not set, halt all cloud work immediately and tell the human.
If spend is at or above 100% of cap, halt. Do not proceed with any cloud action until the human intervenes.

**[HARD] Never push directly to `main`**
All changes go through a feature branch and a pull request.
Branch naming: `feature/<slug>` for features, `fix/<slug>` for bug fixes, `chore/<slug>` for maintenance.

**[HARD] Never commit secrets**
API keys, tokens, passwords, and connection strings never appear in committed files.
Use the project secrets store: Azure Key Vault (`family-safe-kv-dev`).
Environment variables are referenced via `.env` (gitignored) locally and injected by the runtime in cloud environments.
`.env.example` is the only committed env file and contains no real values.

**[HARD] Never implement custom authentication logic**
Authentication is handled exclusively by `azure-ad-b2c`.
Validate JWTs via the `jose` library using the B2C tenant JWKS endpoint.
Do not write token parsing, session management, or password handling code.
If an auth requirement cannot be met by the provider SDK, surface it to the human.

**[HARD] Tests must pass before a PR is raised**
Run `turbo run test lint` and confirm green before opening a pull request.
A PR with failing tests is never acceptable, even to get human eyes on something. Use a draft PR for that.

**[HARD] The dev container is the environment**
All code execution, test runs, and tool invocations happen inside the dev container.
Do not rely on tools installed on the host machine.
Exception: iOS Simulator — this runs on the GitHub Actions macOS runner only, never locally.

---

## Default behaviours

**[DEFAULT] Commit style**
Use conventional commits: `feat`, `fix`, `chore`, `test`, `docs`, `refactor`.
Scope to the workspace: `feat(api)`, `fix(mobile)`, `chore(infra)`.
Keep messages short and imperative.
One logical change per commit. Do not bundle unrelated changes.

**[DEFAULT] Implementation order within a feature**
1. Shared types and API client changes (`/shared`)
2. Backend service(s) (`/services/<name>`)
3. Mobile screens and components (`/mobile`)

**[DEFAULT] Visualization order**
1. Expo web — `npx expo start --web` (dev container, port 8081)
2. Storybook — `npx storybook` (dev container, port 6006)
3. Android Emulator — dev container if KVM available, otherwise CI
4. iOS Simulator — CI only (GitHub Actions macOS runner); never run locally

Screenshots go to `.ai-artifacts/screenshots/` and are embedded in the PR body.

**[DEFAULT] PR description format**
Every PR must include: what this does, what changed, how auth is handled, test results, screenshots, decisions made, known limitations.

**[DEFAULT] Error and loading states**
Every screen and component that fetches data must handle three states: loading, error, and empty.
Do not raise a PR where only the happy path is implemented.

---

## Project structure

```
family-safe/
├── .devcontainer/         # Dev container — the canonical development environment
├── .github/workflows/     # CI/CD — do not edit without updating this file
├── CLAUDE.md              # This file
├── turbo.json             # Task graph — defines build/test/lint/dev tasks
├── mobile/                # React Native (Expo) — the mobile app
├── services/              # Backend services — one folder per service
│   └── api/
│       ├── openapi.yaml   # API contract — source of truth for this service
│       └── ...
├── shared/                # Shared types, API client, utilities
└── infra/
    ├── bootstrap.json     # Project identity — read-only after bootstrap
    ├── budget.json        # Spend cap — read before every cloud action
    └── azure/             # IaC templates (Bicep)
```

---

## Services

### api
- **Purpose:** Backend service — fill in after first feature
- **Port (local):** 3001
- **API spec:** `services/api/openapi.yaml`
- **Auth required:** true

> If a new service is needed, do not create it unilaterally. Surface the need to the human — adding a service is a bootstrap-level action that requires a resource plan and human approval.

---

## Addons active

| Addon | Status | Notes |
|---|---|---|
| `push-notifications` | ✅ Active | Azure Notification Hubs; `ANH_CONNECTION_STRING` and `ANH_HUB_NAME` in Key Vault |
| `realtime` | ✅ Active | SSE via `GET /events`; mobile uses `useServerEvents` hook |
| `webhooks` | — | Not enabled |

---

## Cloud resources (dev)

| Resource | Name | Purpose |
|---|---|---|
| Container Apps Environment | `family-safe-dev-cae` | Hosts API container app |
| Container Registry | `familysafedevacr` | Docker images |
| Key Vault | `family-safe-kv-dev` | Secrets store |
| Notification Hubs namespace | `family-safe-dev-nh-ns` | Push notification routing |
| Notification Hub | `default` | ANH hub instance |

> Resources are provisioned via `infra/azure/dev/main.bicep`. Run `az deployment group create` after setting up your subscription.

---

## Escalate to the human when

- A feature cannot be implemented without a new backend service
- A requirement cannot be met by `azure-ad-b2c` and would need custom auth logic
- The spend cap is reached or the budget estimate for a feature exceeds 20% of remaining headroom
- A test cannot be made to pass after 3 iterations and the root cause is unclear
- An architectural decision affects more than one service or the shared package
- CI is failing on `main` (not a feature branch)
- Any cloud resource behaves unexpectedly after provisioning

---

## What the AI should never do in this project

- Merge a PR (human action only)
- Deploy to staging or production directly (triggered by CI on merge)
- Modify `infra/bootstrap.json` (frozen after bootstrap)
- Raise `monthly_cap` in `infra/budget.json` (human action only)
- Create a new backend service without human approval
- Implement or modify authentication middleware logic
- Add a secret to any committed file

---

*Generated by bootstrap skill v0.2 on 2026-06-15 | Workflow v0.8*
