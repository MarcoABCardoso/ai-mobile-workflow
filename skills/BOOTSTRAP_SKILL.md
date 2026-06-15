# Skill: Project Bootstrap

**Invocation:** `claude bootstrap`
**Version:** 0.5
**Scope:** Greenfield projects only. Do not run against an existing repository.

---

## How this skill runs

The Claude Code session that runs this skill is started **on the target (new) project repository** — not on the workflow repo. The workflow repo is read-only reference material cloned locally in Step 0.

This model is required because a Claude Code session can only push to the repository it was started against. The session cannot write to a second repository.

**Prerequisites before starting the session:**
1. Human creates an empty GitHub repository for the new project (e.g. `github.com/org/my-app`)
2. Human starts a Claude Code session scoped to that new repository
3. Human invokes: `claude bootstrap`

The workflow repo (`ai-mobile-workflow`) is cloned to `/tmp/ai-mobile-workflow` in Step 0 and used as a read-only template source throughout.

---

## Purpose

This skill creates a fully configured, cloud-connected mobile project from scratch. When complete, the human has a working GitHub repository with a React Native monorepo, backend service stubs, cloud dev environment, and CI/CD — ready for the first feature ticket.

---

## Pre-flight Checklist

Before doing anything else, verify the following. If any item fails, **stop and tell the human what is missing**. Do not proceed partially.

- [ ] `bootstrap-seed.json` exists in the current directory and passes schema validation (see below)
- [ ] The current session is on the **target project repository** (not the workflow repo) — confirm with `git remote get-url origin`
- [ ] Cloud credentials are available and reachable — **OR** `skip_provisioning: true` is set in the seed (see below)
  - Azure: `az account show` succeeds and returns the expected subscription
  - GCP: `gcloud auth print-identity-token` succeeds
- [ ] `monthly_budget_usd` is present in the seed and is a positive number
- [ ] **Docker is running** (required to build the dev container)
- [ ] Network access to clone the workflow repo (default: `https://github.com/marcoabcardoso/ai-mobile-workflow.git`)

Report all failures at once, not one at a time.

---

## Seed File Schema

```json
{
  "project_name":       "string, lowercase, hyphens only, max 32 chars",
  "cloud":              "azure | gcp",
  "subscription_id":    "string (Azure subscription ID) | project_id (GCP project ID) — OPTIONAL when skip_provisioning is true",
  "region":             "string — valid region for chosen cloud",
  "services":           ["array of service names, lowercase, hyphens only"],
  "monthly_budget_usd": "number > 0",
  "github": {
    "org":            "string — GitHub org or username",
    "visibility":     "private | public",
    "default_branch": "main"
  },
  "addons":             ["push-notifications", "realtime", "webhooks"],
  "skip_provisioning":  "boolean (optional, default false) — scaffold code only; defer cloud provisioning",
  "workflow_repo":      "string (optional) — URL of the ai-mobile-workflow repo to clone; defaults to https://github.com/marcoabcardoso/ai-mobile-workflow.git"
}
```

`addons` is optional and defaults to `[]`. Include only the capabilities the project needs. Available values:

| Addon | What it adds | Extra cloud cost |
|---|---|---|
| `push-notifications` | FCM/ANH send helper, device token registration, mobile token setup | Azure: ~$0 (Free tier) · GCP: $0 |
| `realtime` | SSE route helper, mobile EventSource hook | None |
| `webhooks` | HMAC validation plugin, webhook route scaffold | None |

`skip_provisioning` is intended for:
- Running bootstrap in a restricted execution environment without cloud CLI access
- Scaffolding the project before subscription credentials are available
- Dry-run / preview purposes

When `skip_provisioning: true`:
- Steps 4 and 5 are skipped
- `subscription_id` is not required in the seed
- The `{{registry_url}}` placeholder in `deploy-prod.yml` and `CLAUDE.md` is set to `"<fill-in-after-provisioning>"`
- The cloud_resources table in `CLAUDE.md` is left as a stub
- A `PROVISIONING.md` file is written to the repo root describing the deferred steps

---

## Execution Steps

Execute these steps **in order**. Do not skip steps. Do not proceed past a step that fails.

### Step 0 — Clone workflow repo

Clone the workflow repo locally. This provides all template files used in Step 3.

```bash
WORKFLOW_REPO="${workflow_repo:-https://github.com/marcoabcardoso/ai-mobile-workflow.git}"
WORKFLOW_DIR="/tmp/ai-mobile-workflow"

git clone "$WORKFLOW_REPO" "$WORKFLOW_DIR" --depth=1
echo "Workflow repo cloned to $WORKFLOW_DIR"
```

If the clone fails, stop and report the error. The workflow repo is required for all subsequent steps.

---

### Step 1 — Validate seed and confirm with human

If `bootstrap-seed.json` does not exist in the current directory, offer to create it interactively:

```
No bootstrap-seed.json found. Would you like me to create one? (yes/no)
```

If yes, ask for each required field in turn and write the file. If no, halt and instruct the human to create the file.

Parse `bootstrap-seed.json`. Display a human-readable summary:

```
Bootstrap plan for: <project_name>
Cloud:              <cloud> (<subscription_id | "deferred">) — <region>
Services:           <comma-separated list>
Addons:             <comma-separated list, or "none">
Monthly budget cap: $<monthly_budget_usd>
GitHub:             <org>/<project_name> (<visibility>)
Provisioning:       <"will provision dev resources" | "DEFERRED (skip_provisioning: true)">

Proceed? (yes to continue)
```

Wait for explicit confirmation. Do not auto-proceed.

---

### Step 2 — Create bootstrap branch

The repository already exists (the session was started against it). Create and switch to the bootstrap branch:

```bash
# Confirm we are on the right repo
git remote get-url origin  # should match github.com/<org>/<project_name>

# Create bootstrap branch
git checkout -b bootstrap/init
```

If the branch already exists, check whether a previous bootstrap was attempted and ask the human how to proceed before overwriting.

Configure branch protection (requires a GitHub token or MCP tools with admin scope):

```bash
# Via gh CLI (if available)
gh api repos/<org>/<project_name>/branches/main/protection \
  --method PUT \
  --field required_pull_request_reviews[required_approving_review_count]=1 \
  --field enforce_admins=false \
  --field restrictions=null \
  --field required_status_checks[strict]=true \
  --field required_status_checks[contexts][]=lint \
  --field required_status_checks[contexts][]=test

# OR: GitHub MCP tool
mcp__github__... (equivalent protection call)
```

> Branch protection is best-effort at this stage. If admin scope is unavailable, skip it and note it in the bootstrap PR body so the human can configure it manually.

> For solo developers (team size = 1): set `required_approving_review_count=0` — PRs are still required for traceability, but self-merge is allowed.

**Emit:** Confirm branch created and current working directory is the project root.

---

### Step 3 — Scaffold monorepo

Generate the following structure. All files are templates — fill in `<project_name>`, `<cloud>`, and service names from the seed.

```
<project_name>/
├── .devcontainer/
│   ├── devcontainer.json
│   └── Dockerfile
├── .github/
│   └── workflows/
│       ├── ci.yml              ← lint, test, build on every PR
│       └── deploy-prod.yml     ← deploy to production on merge to main
├── CLAUDE.md                   ← project-level AI instructions (see template below)
├── turbo.json
├── package.json                ← workspace root with workspaces glob
├── .env.example
├── mobile/
│   ├── app/
│   │   ├── (tabs)/
│   │   │   └── index.tsx
│   │   └── _layout.tsx
│   ├── components/
│   ├── .storybook/
│   ├── app.json
│   └── package.json
├── services/
│   └── <service-name>/         ← repeat for each service in seed
│       ├── src/
│       │   ├── index.ts
│       │   ├── db/
│       │   │   ├── index.ts    ← Drizzle client instance
│       │   │   └── schema.ts   ← table definitions (source of truth for data model)
│       │   └── plugins/
│       │       └── auth.ts     ← JWT validation hook (Firebase or B2C via jose)
│       ├── drizzle/            ← generated SQL migrations (never edited by hand)
│       ├── tests/
│       │   └── health.test.ts
│       ├── drizzle.config.ts
│       ├── openapi.yaml        ← generated by `npm run generate:openapi`; not hand-written
│       ├── vitest.config.ts
│       ├── Dockerfile
│       └── package.json
├── shared/
│   ├── types/
│   ├── api-client/
│   └── package.json
└── infra/
    ├── bootstrap.json          ← derived from seed (no secrets)
    ├── budget.json             ← spend cap config
    └── <cloud>/                ← azure/ or gcp/
        └── dev/
            └── main.tf         ← or main.bicep
```

**`turbo.json` — task graph:**
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build":    { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "test":     { "dependsOn": ["^build"] },
    "lint":     {},
    "dev":      { "cache": false, "persistent": true },
    "generate": { "dependsOn": ["^build"], "outputs": ["src/generated/**"] }
  }
}
```

**`services/<name>/src/index.ts` — Fastify entry point:**
```typescript
import Fastify from 'fastify'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'

export const app = Fastify({ logger: true })

await app.register(swagger, {
  openapi: {
    info: { title: '<service-name>', version: '1.0.0' },
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
  },
})
await app.register(swaggerUi, { routePrefix: '/docs' })

app.get('/health', {
  schema: { response: { 200: { type: 'object', properties: { status: { type: 'string' } } } } },
}, async () => ({ status: 'ok' }))

// Register feature route modules here

if (process.env.NODE_ENV !== 'test') {
  await app.listen({ port: 3000, host: '0.0.0.0' })
}
```

**`services/<name>/src/db/schema.ts` — Drizzle table definitions:**
```typescript
import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core'

// Convention: snake_case names; uuid primary keys generated by the database.
// Add tables here as features require them.
export const users = pgTable('users', {
  id:         uuid('id').primaryKey().defaultRandom(),
  externalId: text('external_id').notNull().unique(), // auth provider UID
  createdAt:  timestamp('created_at').defaultNow().notNull(),
})
```

**`services/<name>/src/db/index.ts` — Drizzle client:**
```typescript
import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from './schema.js'

export const db = drizzle(process.env.DATABASE_URL!, { schema })
```

**`services/<name>/src/plugins/auth.ts` — JWT validation:**
```typescript
import fp from 'fastify-plugin'
import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import { createRemoteJWKSet, jwtVerify } from 'jose'

// Azure AD B2C
const B2C_TENANT = process.env.AZURE_AD_B2C_TENANT_NAME!
const B2C_POLICY = process.env.AZURE_AD_B2C_POLICY_NAME!
const B2C_CLIENT = process.env.AZURE_AD_B2C_CLIENT_ID!
const jwks = createRemoteJWKSet(new URL(
  `https://${B2C_TENANT}/${B2C_TENANT}/${B2C_POLICY}/discovery/v2.0/keys`
))

// GCP / Firebase Auth alternative:
// const jwks = createRemoteJWKSet(new URL(
//   'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
// ))

declare module 'fastify' {
  interface FastifyRequest { user: { sub: string; email?: string } }
  interface FastifyInstance { authenticate: (req: FastifyRequest) => Promise<void> }
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate('authenticate', async (request: FastifyRequest) => {
    const auth = request.headers.authorization
    if (!auth?.startsWith('Bearer ')) throw fastify.httpErrors.unauthorized('Missing token')
    const token = auth.slice(7)
    const { payload } = await jwtVerify(token, jwks, {
      issuer:   `https://${B2C_TENANT}/${B2C_TENANT}/${B2C_POLICY}/v2.0/`,
      audience: B2C_CLIENT,
    })
    request.user = { sub: payload.sub as string, email: payload.email as string | undefined }
  })
}
export default fp(authPlugin)
```

> **Auth note:** Use `jose` (JWKS + `jwtVerify`) rather than `@azure/msal-node` for server-side JWT *validation*. `msal-node` is for *acquiring* tokens (client credential flows), not for verifying them. `jose` is the correct library for validating incoming Bearer tokens using the provider's JWKS endpoint.

**`services/<name>/drizzle.config.ts`:**
```typescript
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema:        './src/db/schema.ts',
  out:           './drizzle',
  dialect:       'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
})
```

**`services/<name>/vitest.config.ts`:**
```typescript
import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { globals: true, environment: 'node' } })
```

**`services/<name>/package.json` — key scripts:**
```json
{
  "scripts": {
    "dev":               "tsx watch src/index.ts",
    "build":             "tsc --noEmit",
    "test":              "vitest run",
    "test:integration":  "vitest run tests/integration",
    "generate:openapi":  "tsx scripts/export-openapi.ts"
  }
}
```

**`services/<name>/scripts/export-openapi.ts` — spec generation:**
```typescript
import { writeFileSync } from 'fs'
import yaml from 'js-yaml'
import { app } from '../src/index.js'

await app.ready()
writeFileSync('openapi.yaml', yaml.dump(app.swagger()))
await app.close()
```

> Run `npm run generate:openapi` after any route schema change. This updates `openapi.yaml`, which is then used by `shared/api-client` to regenerate TypeScript types.

**`mobile/app/_layout.tsx` — root layout (global providers):**
```typescript
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Stack } from 'expo-router'

const queryClient = new QueryClient()

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <Stack />
    </QueryClientProvider>
  )
}
```

**`shared/api-client/src/index.ts` — typed HTTP client:**
```typescript
import createClient from 'openapi-fetch'
import type { paths } from '../generated/types'

export const apiClient = createClient<paths>({
  baseUrl: process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:3000',
})
```

> **Generated types stub:** On first bootstrap, create `shared/api-client/src/generated/types.d.ts` as a stub with empty `paths`, `components`, and `operations` interfaces. This satisfies TypeScript until `npm run generate` is run after the first route is added.

**`shared/api-client/package.json` — type generation script:**
```json
{
  "scripts": {
    "generate": "openapi-typescript ../services/<name>/openapi.yaml -o src/generated/types.d.ts"
  }
}
```

**`.devcontainer/Dockerfile` — dev container image:**
```dockerfile
FROM mcr.microsoft.com/devcontainers/base:ubuntu-22.04

# Node.js 20
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs

# GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | \
    dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | \
    tee /etc/apt/sources.list.d/github-cli.list && \
    apt-get update && apt-get install -y gh

# Cloud CLI — Azure or GCP (templated from bootstrap.json `cloud` field)
# Azure:
RUN curl -sL https://aka.ms/InstallAzureCLIDeb | bash
# GCP (alternative):
# RUN curl https://sdk.cloud.google.com | bash

# Terraform
RUN apt-get install -y gnupg software-properties-common && \
    wget -O- https://apt.releases.hashicorp.com/gpg | gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | \
    tee /etc/apt/sources.list.d/hashicorp.list && \
    apt-get update && apt-get install -y terraform

# Expo + Playwright
RUN npm install -g expo-cli && \
    npx playwright install --with-deps chromium

# Android SDK + emulator
RUN apt-get install -y android-sdk
ENV ANDROID_HOME=/usr/lib/android-sdk

# NOTE: iOS Simulator is intentionally excluded.
# iOS validation runs on GitHub Actions macOS runners only.
```

**`.devcontainer/devcontainer.json`:**
```json
{
  "name": "<project_name>-dev",
  "build": { "dockerfile": "Dockerfile" },
  "forwardPorts": [8081, 6006, 3001],
  "portsAttributes": {
    "8081": { "label": "Expo Web" },
    "6006": { "label": "Storybook" },
    "3001": { "label": "API" }
  },
  "postCreateCommand": "npm install",
  "remoteEnv": {
    "CLOUD": "<cloud>",
    "PROJECT_NAME": "<project_name>"
  },
  "features": {
    "ghcr.io/devcontainers/features/docker-in-docker:2": {}
  }
}
```

> The `docker-in-docker` feature allows service containers (backends) to be run inside the dev container during integration tests without needing the host Docker socket.

**`infra/budget.json` — generated from seed:**
```json
{
  "currency": "USD",
  "monthly_cap": <monthly_budget_usd>,
  "alert_thresholds": [50, 75, 90],
  "hard_stop_at_percent": 100,
  "environment": "development",
  "owner": "<github.org>"
}
```

**`CLAUDE.md` — project-level AI instructions template:**
```markdown
# <project_name> — AI Instructions

## Project type
React Native (Expo) monorepo with <N> backend services.
Cloud: <cloud> | Region: <region>

## Hard rules
- Always read `infra/budget.json` before any cloud provisioning.
- Never push directly to `main`. All changes via PR from a feature branch.
- Never commit secrets. Use the project secrets store for all credentials.
- Run `turbo test lint` before marking any task complete.

## Services
<list each service with one-line description>

## Visualization order (run in dev container unless noted)
1. Expo web (`npx expo start --web`) — dev container
2. Storybook (`turbo dev --filter=mobile -- --storybook`) — dev container
3. Android Emulator — dev container (requires KVM on host) or CI
4. iOS Simulator — CI only (GitHub Actions macOS runner); never run locally

## Cloud resource templates
Use `/infra/<cloud>/` as the reference for all IaC.
```

**Conditional addon scaffolding**

Generate the following additional files for each declared addon.

**`push-notifications` addon:**
- `services/<name>/src/plugins/push.ts` — notification send helper (FCM for GCP, ANH for Azure)
- `services/<name>/src/routes/devices.ts` — `POST /devices/register` for token storage
- Add `deviceTokens` table to `services/<name>/src/db/schema.ts`
- `mobile/lib/notifications.ts` — permission request + token registration on login

**`realtime` addon:**
- `services/<name>/src/plugins/sse.ts` — in-memory subscriber registry + `subscribeClient` / `pushToUser` decorators
- `services/<name>/src/routes/events.ts` — `GET /events` SSE endpoint (authenticated)
- `mobile/hooks/useServerEvents.ts` — `EventSource` hook (uses `react-native-sse` polyfill)

**`webhooks` addon:**
- `services/<name>/src/plugins/webhooks.ts` — raw body parsing + HMAC `verifyWebhookSignature` decorator
- `services/<name>/src/routes/webhooks/` — directory for per-provider webhook routes (empty at bootstrap)

---

**Template substitution**

Copy template files from the locally cloned workflow repo (`$WORKFLOW_DIR`) into the new project, substituting `{{placeholders}}` from the seed and derived values.

```bash
WORKFLOW_DIR="/tmp/ai-mobile-workflow"
```

| Source (`$WORKFLOW_DIR/`) | Destination (project root) | Notes |
|---|---|---|
| `templates/CLAUDE.md.template` | `CLAUDE.md` | Substitute all placeholders (see table below) |
| `templates/ci.yml` | `.github/workflows/ci.yml` | Copy as-is — no placeholders |
| `templates/deploy-prod.yml` | `.github/workflows/deploy-prod.yml` | Substitute placeholders |
| `templates/smoke-tests.js` | `scripts/smoke-tests.js` | Substitute addon sections — uncomment active addon checks |
| `infra/azure/dev/main.bicep` | `infra/azure/dev/main.bicep` | Copy as-is — uses Bicep `param` |
| `infra/azure/dev/main.bicepparam` | `infra/azure/dev/main.bicepparam` | Substitute `{{project_name}}`, `{{region}}`, `{{github_org}}` |
| `infra/gcp/dev/main.tf` | `infra/gcp/dev/main.tf` | Copy as-is — uses Terraform `variable` |
| `infra/gcp/dev/terraform.tfvars.example` | `infra/gcp/dev/terraform.tfvars` | Substitute all placeholders; name changes to `.tfvars` (gitignored) |

**Placeholder substitution table:**

| Placeholder | Value |
|---|---|
| `{{project_name}}` | `bootstrap-seed.json` → `project_name` |
| `{{cloud}}` | `bootstrap-seed.json` → `cloud` |
| `{{region}}` | `bootstrap-seed.json` → `region` |
| `{{services}}` | `bootstrap-seed.json` → `services` joined as comma-separated string |
| `{{auth_provider}}` | Derived: `cloud=azure` → `azure-ad-b2c` · `cloud=gcp` → `firebase-auth` |
| `{{bootstrap_date}}` | Current date in ISO 8601 (e.g. `2026-06-15`) |
| `{{registry_url}}` | From Step 5 IaC output: ACR login server (Azure) or Artifact Registry URL (GCP). If `skip_provisioning: true`, use `"<fill-in-after-provisioning>"` |
| `{{github_org}}` | `bootstrap-seed.json` → `github.org` |
| `{{addon_push_notifications}}` | `true` if `push-notifications` in `addons`, else `false` |
| `{{addon_realtime}}` | `true` if `realtime` in `addons`, else `false` |
| `{{addon_webhooks}}` | `true` if `webhooks` in `addons`, else `false` |

For the `{{#each services}}` blocks in `CLAUDE.md`:
- `name` — service name from seed
- `description` — `"Backend service — fill in after first feature"` (placeholder)
- `port` — assign sequentially starting at `3001`
- `auth_required` — `true` (default; adjust per-service if needed)

For `smoke-tests.js` addon substitution:
- For each active addon, uncomment the corresponding check block
- For each inactive addon, remove the commented block entirely (don't leave dead code)

For the `{{#each cloud_resources}}` block — leave as a stub until Step 5 provisioning completes, then backfill from the IaC outputs.

Commit everything to `bootstrap/init`:
```bash
git add .
git commit -m "chore: scaffold monorepo via bootstrap skill"
```

---

### Step 4 — Generate and display resource plan

> **Skip if `skip_provisioning: true`.** Jump directly to Step 6.

Calculate estimated monthly costs for the dev environment based on `services` in the seed. Use the smallest viable SKUs. Display the plan in this format:

```
RESOURCE PLAN — <project_name> (dev environment)
Cloud: <cloud> | Region: <region> | Budget cap: $<cap>/month

Resource                        SKU              Est. $/month
─────────────────────────────────────────────────────────────
Estimated total (dev):          ~$X–Y/month
Remaining budget headroom:      ~$Z/month  (<N>% of cap)
```

Include a note if estimated cost exceeds 50% of cap.

**Wait for explicit human approval before proceeding to Step 5.**

---

### Step 5 — Provision dev environment

> **Skip if `skip_provisioning: true`.** Jump directly to Step 6.

Apply IaC for dev baseline only. Do not provision staging or prod.

**Azure:**
```bash
RESOURCE_GROUP="<project_name>-dev-rg"
az group create --name "$RESOURCE_GROUP" --location "<region>"
az deployment group create \
  --name main \
  --resource-group "$RESOURCE_GROUP" \
  --template-file infra/azure/dev/main.bicep \
  --parameters infra/azure/dev/main.bicepparam
```

Capture the outputs for later steps:
```bash
KV_NAME=$(az deployment group show \
  --resource-group "$RESOURCE_GROUP" --name main \
  --query properties.outputs.keyVaultName.value -o tsv)
REGISTRY=$(az deployment group show \
  --resource-group "$RESOURCE_GROUP" --name main \
  --query properties.outputs.registryLoginServer.value -o tsv)
```

**GCP:**
```bash
cd infra/gcp/dev
terraform init
terraform apply -auto-approve

REGISTRY=$(terraform output -raw artifact_registry_url)
CLOUD_RUN_URL=$(terraform output -raw cloud_run_url)
```

---

**Auth provider setup (runs after IaC apply)**

> ⛔ Do not proceed if IaC apply failed. Auth setup writes secrets into the provisioned secrets store.

**Azure — Azure AD B2C:**

```bash
SUBSCRIPTION_ID=$(az account show --query id -o tsv)

az resource create \
  --resource-type Microsoft.AzureActiveDirectory/b2cDirectories \
  --resource-group "$RESOURCE_GROUP" \
  --api-version 2021-04-01 \
  --name "<project_name>b2c.onmicrosoft.com" \
  --is-full-object \
  --properties '{
    "location": "United States",
    "sku": { "name": "PremiumP1", "tier": "A0" },
    "properties": {
      "createTenantProperties": {
        "displayName": "<project_name>",
        "countryCode": "US"
      }
    }
  }'

B2C_TENANT_ID=$(az resource show \
  --ids "/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RESOURCE_GROUP/providers/Microsoft.AzureActiveDirectory/b2cDirectories/<project_name>b2c.onmicrosoft.com" \
  --query properties.tenantId -o tsv)

az login --tenant "$B2C_TENANT_ID" --allow-no-subscriptions

APP_CLIENT_ID=$(az ad app create \
  --display-name "<project_name>-api" \
  --sign-in-audience AzureADMyOrg \
  --query appId -o tsv)

az login  # switch back to main tenant
az keyvault secret set --vault-name "$KV_NAME" --name "B2C-TENANT-ID"   --value "$B2C_TENANT_ID"
az keyvault secret set --vault-name "$KV_NAME" --name "B2C-CLIENT-ID"   --value "$APP_CLIENT_ID"
az keyvault secret set --vault-name "$KV_NAME" --name "B2C-TENANT-NAME" --value "<project_name>b2c.onmicrosoft.com"
az keyvault secret set --vault-name "$KV_NAME" --name "B2C-POLICY-NAME" --value "B2C_1_SignUpSignIn"
```

**GCP — Firebase Auth:**

```bash
firebase projects:addfirebase "$GCP_PROJECT_ID"

echo "ACTION REQUIRED: Enable auth providers in Firebase console:"
echo "  https://console.firebase.google.com/project/$GCP_PROJECT_ID/authentication/providers"

FIREBASE_APP_ID=$(firebase apps:create WEB "<project_name>-web" \
  --project "$GCP_PROJECT_ID" --json \
  | jq -r '.result.appId')

firebase apps:sdkconfig WEB "$FIREBASE_APP_ID" \
  --project "$GCP_PROJECT_ID" --json \
  | jq '.result.sdkConfig' > /tmp/firebase-config.json

gcloud secrets versions add "<project_name>-dev-firebase-config" \
  --data-file=/tmp/firebase-config.json \
  --project "$GCP_PROJECT_ID"

rm /tmp/firebase-config.json
```

---

**Addon provisioning (runs after auth setup, only for declared addons)**

**`push-notifications` addon — Azure only** (GCP: FCM is already available, no provisioning needed):
```bash
ANH_CONN=$(az notification-hub namespace authorization-rule list-keys \
  --resource-group "$RESOURCE_GROUP" \
  --namespace-name "<project_name>-dev-nh-ns" \
  --notification-hub-name "default" \
  --name DefaultFullSharedAccessSignature \
  --query primaryConnectionString -o tsv)

az keyvault secret set --vault-name "$KV_NAME" --name "ANH-CONNECTION-STRING" --value "$ANH_CONN"
az keyvault secret set --vault-name "$KV_NAME" --name "ANH-HUB-NAME" --value "default"
```

**`webhooks` addon — both clouds:**
```bash
# Azure — repeat for each provider
az keyvault secret set --vault-name "$KV_NAME" \
  --name "<PROVIDER>-WEBHOOK-SECRET" --value "<secret-from-provider-dashboard>"

# GCP — repeat for each provider
echo -n "<secret-from-provider-dashboard>" | \
  gcloud secrets versions add "<project_name>-<provider>-webhook-secret" --data-file=- \
  --project "$GCP_PROJECT_ID"
```

**`realtime` addon** — no provisioning needed.

---

Tag all resources:
```
project     = <project_name>
environment = dev
owner       = <github.org>
ai-managed  = true
```

Run health check after provisioning:
- Ping each provisioned endpoint
- Verify secrets store is reachable
- Verify container registry login succeeds

Report results. If any health check fails, output the error and proposed fix but **do not auto-remediate** — ask the human.

Now backfill `{{registry_url}}` in `deploy-prod.yml` and the cloud_resources table in `CLAUDE.md` from IaC outputs, and commit:
```bash
git add .
git commit -m "chore: provision dev environment baseline"
git push origin bootstrap/init
```

---

### Step 6 — Open bootstrap PR

```bash
gh pr create \
  --base main \
  --head bootstrap/init \
  --title "chore: project bootstrap — <project_name>" \
  --body "$(cat << 'EOF'
## Bootstrap summary

- **Cloud:** <cloud> (<region>)
- **Services:** <list>
- **Budget cap:** $<cap>/month
- **Estimated dev cost:** ~$X–Y/month (or N/A if skip_provisioning)
- **Provisioning:** <done / deferred — see PROVISIONING.md>

## What was provisioned
<list resources, or "Deferred — see PROVISIONING.md">

## Health checks
<pass/fail per check, or "N/A — provisioning deferred">

## Next step
Review and merge this PR to begin feature development.
EOF
)"
```

---

### Step 7 — Report completion

```
✅ Bootstrap complete.

Repository:  https://github.com/<org>/<project_name>
PR:          https://github.com/<org>/<project_name>/pull/1
Cloud:       <cloud> dev environment provisioned  (or: provisioning deferred)
Budget used: ~$X (estimated) of $<cap>/month cap  (or: N/A)

To start developing:
1. Merge the bootstrap PR
2. Clone the repo if you haven't already
3. Run: npm install && turbo dev
```

If `skip_provisioning` was true, append:
```
Provisioning deferred. When ready:
  See PROVISIONING.md in the repo root for the full provisioning runbook.
  You will need: Azure subscription ID, az CLI, and Key Vault access.
```

---

## Error Handling

| Failure | AI behaviour |
|---|---|
| Seed validation fails | List all invalid fields; do not proceed |
| Workflow repo clone fails | Report the error; check network access and `workflow_repo` URL in seed; halt |
| Wrong session repo | If `git remote get-url origin` doesn't match `<org>/<project_name>`, stop and tell the human to start a new session on the correct repository |
| GitHub API error | Display error + required token scopes; halt |
| Cloud auth failure | Display auth steps for chosen cloud; halt |
| IaC plan shows cost > cap | Halt; show which resources exceed budget; ask human to adjust |
| IaC apply fails | Display Terraform/Bicep error; propose fix; wait for human |
| Health check fails | Report which checks failed; do not auto-remediate; wait |
| Any unexpected error | Halt all steps; do not partially apply; report state clearly |

---

## What This Skill Does NOT Do

- It does not create GitHub repositories — the human must create the repository before starting the session
- It does not provision staging or production environments (those are triggered separately)
- It does not scaffold feature code — only the project skeleton
- It does not set up third-party services (analytics, crash reporting, etc.) — those are added per-feature
- It does not run on existing repositories

---

*Skill version: 0.5 | Workflow version: 0.9 | Last updated: 2026-06-15*
*Changes in 0.5: new session-on-target-repo invocation model; Step 0 clones workflow repo locally; Step 2 simplified (no repo creation — session already on target repo); template sources updated to `$WORKFLOW_DIR/templates/` and `$WORKFLOW_DIR/infra/`; `workflow_repo` optional seed field added; interactive seed creation in Step 1; error table updated.*
*Changes in 0.4: added user-creates-repo-upfront flow in Step 2; agent proactively asks human to create repo with exact settings when creation permissions are unavailable, rather than halting at the end.*
*Changes in 0.3: added `skip_provisioning` mode, clarified auth library (jose vs msal-node), added MCP fallback for repo creation, added `generate` task to turbo.json, fixed smoke-tests.js substitution guidance, documented types.d.ts stub pattern.*
