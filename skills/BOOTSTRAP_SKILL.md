# Skill: Project Bootstrap

**Invocation:** `claude bootstrap`
**Version:** 0.8
**Scope:** Greenfield projects only. Do not run against an existing repository.

---

## How this skill runs

The Claude Code session runs on the **target (new) project repository** — not on the workflow repo.

The AI's job in this skill is narrow: **collect information and write `bootstrap-seed.json`**, then hand off to a deterministic script that generates all project files.

```
AI role       →  ask questions, write bootstrap-seed.json, confirm plan
Script role   →  generate all files, create git branch, commit
AI role again →  provision cloud resources (if not deferred), open PR
```

The script lives in the workflow repo: `scripts/bootstrap.js`. It reads the seed, writes every file, and commits — no AI judgement involved in file generation.

> **HARD RULE — never scaffold files manually.** If `bootstrap.js` fails, diagnose the error, fix the seed or the script, and re-run. Do not fall back to writing project files by hand. The script is the single source of truth for what a scaffolded project looks like.

**Prerequisites the human must complete before starting the session:**
1. Create an empty GitHub repository for the new project (the script creates the `main` branch automatically from an empty init commit)
2. Start a Claude Code session scoped to that repository
3. Invoke `claude bootstrap`

---

## Purpose

Produce a fully configured, cloud-ready mobile monorepo in a single session. When the PR is merged, the project is ready for the first feature ticket.

---

## Seed Schema

The AI writes `bootstrap-seed.json` with these fields. The script validates the file before running.

```json
{
  "project_name":       "string — lowercase, hyphens only, max 32 chars",
  "cloud":              "azure | gcp",
  "subscription_id":    "string — Azure subscription ID or GCP project ID (OPTIONAL when skip_provisioning: true)",
  "region":             "string — valid region for chosen cloud",
  "services":           ["array of service names, lowercase, hyphens only"],
  "monthly_budget_usd": "number > 0",
  "github": {
    "org":            "string — GitHub org or username",
    "visibility":     "private | public",
    "default_branch": "main"
  },
  "addons":            ["push-notifications", "realtime", "webhooks"],
  "skip_provisioning": "boolean (optional, default false)",
  "workflow_repo":     "string (optional) — clone URL of ai-mobile-workflow; defaults to https://github.com/marcoabcardoso/ai-mobile-workflow.git"
}
```

**Available addons:**

| Addon | What it generates |
|---|---|
| `push-notifications` | ANH/FCM send plugin, device token route, mobile token registration |
| `realtime` | SSE plugin + route, mobile EventSource hook |
| `webhooks` | HMAC verification plugin, empty webhook routes directory |

**`skip_provisioning: true`** skips Steps 3 and 4. Use when cloud credentials aren't available yet or for a code-only dry run. A `PROVISIONING.md` runbook is written to the repo.

---

## Execution Steps

### Step 1 — Clone the workflow repo

```bash
WORKFLOW_REPO="${workflow_repo:-https://github.com/marcoabcardoso/ai-mobile-workflow.git}"
WORKFLOW_DIR="/tmp/ai-mobile-workflow"
git clone "$WORKFLOW_REPO" "$WORKFLOW_DIR" --depth=1
echo "Workflow repo ready at $WORKFLOW_DIR"
```

If the clone fails, stop and report the error. The script cannot run without the workflow repo.

---

### Step 2 — Collect seed and write bootstrap-seed.json

If `bootstrap-seed.json` already exists, read it and show a summary for confirmation. Otherwise, ask for each field in turn:

1. `project_name` — suggest a slug derived from the repo name
2. `cloud` — `azure` or `gcp`
3. `region` — suggest the closest region for the user's location
4. `services` — names of backend services (start with `["api"]` if unsure)
5. `monthly_budget_usd` — suggest `$25` for solo projects, `$100` for teams
6. `github.org` — read from `git remote get-url origin`
7. `github.visibility` — default `private`
8. `addons` — list options with one-line descriptions; default `[]`
9. `skip_provisioning` — ask if cloud CLI is available in this session

Write `bootstrap-seed.json` and display a confirmation summary:

```
Bootstrap plan for: <project_name>
Cloud:              <cloud> (<subscription_id | "deferred">) — <region>
Services:           <comma-separated>
Addons:             <comma-separated, or "none">
Budget cap:         $<monthly_budget_usd>/month
GitHub:             <org>/<project_name> (<visibility>)
Provisioning:       <"will provision" | "DEFERRED (skip_provisioning: true)">

Proceed? (yes / no)
```

Wait for explicit confirmation before continuing.

---

### Step 3 — Run the bootstrap script

```bash
node "$WORKFLOW_DIR/scripts/bootstrap.js"
```

The script:
- Validates `bootstrap-seed.json`
- Creates the `bootstrap/init` branch
- Copies and substitutes template files from `$WORKFLOW_DIR/templates/` and `$WORKFLOW_DIR/infra/`
- Generates all service, mobile, and shared package files
- Activates or removes addon code blocks
- Commits everything with `chore(bootstrap): scaffold <project_name> monorepo`

If the script exits non-zero, read its output, diagnose the failure, fix the root cause (usually a seed field), and re-run. Do not attempt to scaffold files manually.

---

### Step 4 — Provision dev environment

> **Skip entirely if `skip_provisioning: true`.** Jump to Step 5.

**Azure:**
```bash
RESOURCE_GROUP="${project_name}-dev-rg"
az group create --name "$RESOURCE_GROUP" --location "<region>"
az deployment group create \
  --name main \
  --resource-group "$RESOURCE_GROUP" \
  --template-file infra/azure/dev/main.bicep \
  --parameters infra/azure/dev/main.bicepparam

KV_NAME=$(az deployment group show \
  --resource-group "$RESOURCE_GROUP" --name main \
  --query properties.outputs.keyVaultName.value -o tsv)
REGISTRY=$(az deployment group show \
  --resource-group "$RESOURCE_GROUP" --name main \
  --query properties.outputs.registryLoginServer.value -o tsv)
```

**GCP:**
```bash
cd infra/gcp/dev && terraform init && terraform apply -auto-approve
REGISTRY=$(terraform output -raw artifact_registry_url)
```

**Auth provider setup** (after IaC apply):

*Azure — AD B2C:*
```bash
SUBSCRIPTION_ID=$(az account show --query id -o tsv)

az resource create \
  --resource-type Microsoft.AzureActiveDirectory/b2cDirectories \
  --resource-group "$RESOURCE_GROUP" \
  --api-version 2021-04-01 \
  --name "${project_name}b2c.onmicrosoft.com" \
  --is-full-object \
  --properties '{
    "location": "United States",
    "sku": { "name": "PremiumP1", "tier": "A0" },
    "properties": { "createTenantProperties": { "displayName": "<project_name>", "countryCode": "US" } }
  }'

B2C_TENANT_ID=$(az resource show \
  --ids "/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RESOURCE_GROUP/providers/Microsoft.AzureActiveDirectory/b2cDirectories/${project_name}b2c.onmicrosoft.com" \
  --query properties.tenantId -o tsv)

az login --tenant "$B2C_TENANT_ID" --allow-no-subscriptions

APP_CLIENT_ID=$(az ad app create \
  --display-name "${project_name}-api" --sign-in-audience AzureADMyOrg --query appId -o tsv)

az login  # back to main tenant
az keyvault secret set --vault-name "$KV_NAME" --name "B2C-TENANT-ID"   --value "$B2C_TENANT_ID"
az keyvault secret set --vault-name "$KV_NAME" --name "B2C-CLIENT-ID"   --value "$APP_CLIENT_ID"
az keyvault secret set --vault-name "$KV_NAME" --name "B2C-TENANT-NAME" --value "${project_name}b2c.onmicrosoft.com"
az keyvault secret set --vault-name "$KV_NAME" --name "B2C-POLICY-NAME" --value "B2C_1_SignUpSignIn"
```

*GCP — Firebase Auth:*
```bash
firebase projects:addfirebase "$GCP_PROJECT_ID"
echo "ACTION REQUIRED: enable auth providers at https://console.firebase.google.com/project/$GCP_PROJECT_ID/authentication/providers"

FIREBASE_APP_ID=$(firebase apps:create WEB "${project_name}-web" --project "$GCP_PROJECT_ID" --json | jq -r '.result.appId')
firebase apps:sdkconfig WEB "$FIREBASE_APP_ID" --project "$GCP_PROJECT_ID" --json \
  | jq '.result.sdkConfig' > /tmp/firebase-config.json
gcloud secrets versions add "${project_name}-dev-firebase-config" --data-file=/tmp/firebase-config.json --project "$GCP_PROJECT_ID"
rm /tmp/firebase-config.json
```

**Addon provisioning** (after auth setup):

*`push-notifications` on Azure:*
```bash
ANH_CONN=$(az notification-hub namespace authorization-rule list-keys \
  --resource-group "$RESOURCE_GROUP" \
  --namespace-name "${project_name}-dev-nh-ns" \
  --notification-hub-name "default" \
  --name DefaultFullSharedAccessSignature \
  --query primaryConnectionString -o tsv)
az keyvault secret set --vault-name "$KV_NAME" --name "ANH-CONNECTION-STRING" --value "$ANH_CONN"
az keyvault secret set --vault-name "$KV_NAME" --name "ANH-HUB-NAME"          --value "default"
```

*`webhooks` addon:*
```bash
# Azure — repeat for each provider
az keyvault secret set --vault-name "$KV_NAME" --name "<PROVIDER>-WEBHOOK-SECRET" --value "<secret-from-provider>"
# GCP — repeat for each provider
echo -n "<secret>" | gcloud secrets versions add "${project_name}-<provider>-webhook-secret" --data-file=- --project "$GCP_PROJECT_ID"
```

After provisioning, backfill `{{registry_url}}` in `.github/workflows/deploy-prod.yml` and the cloud_resources table in `CLAUDE.md`, then commit and push:

```bash
# edit the two files to replace <fill-in-after-provisioning> with $REGISTRY
git add .github/workflows/deploy-prod.yml CLAUDE.md
git commit -m "chore: backfill registry URL after provisioning"
git push origin bootstrap/init
```

---

### Step 5 — Open bootstrap PR

The script creates `main` locally (empty init commit) if no branches exist yet, then branches from it. Push both branches before opening the PR:

```bash
git push origin main              # establishes main on the remote (PR base)
git push -u origin bootstrap/init
```

**GCP only — verify terraform.tfvars was not committed:**
The script writes `infra/gcp/dev/terraform.tfvars` (which contains real values from the seed such as `project_id`) and adds it to `.gitignore` before `git add .` runs. Git should therefore never stage it. Confirm with:
```bash
git show HEAD -- infra/gcp/dev/terraform.tfvars  # must return nothing
```
If it was committed, remove it: `git rm --cached infra/gcp/dev/terraform.tfvars && git commit -m "fix: untrack terraform.tfvars"`.

```bash
git push -u origin bootstrap/init

gh pr create \
  --base main \
  --head bootstrap/init \
  --title "chore: project bootstrap — <project_name>" \
  --body "$(cat << 'EOF'
## Bootstrap summary

- **Cloud:** <cloud> (<region>)
- **Services:** <list>
- **Addons:** <list or none>
- **Budget cap:** $<monthly_budget_usd>/month
- **Provisioning:** <done / deferred — see PROVISIONING.md>

## Health checks
<pass/fail per check, or "N/A — provisioning deferred">

## Next step
Review and merge this PR to begin feature development.
EOF
)"
```

---

### Step 6 — Report completion

```
✅ Bootstrap complete.

Repository:  https://github.com/<org>/<project_name>
PR:          https://github.com/<org>/<project_name>/pull/1
Cloud:       <cloud> dev environment provisioned  (or: deferred — see PROVISIONING.md)
```

---

## Error Handling

| Failure | Action |
|---|---|
| Workflow repo clone fails | Report error; check network and `workflow_repo` in seed; halt |
| Wrong session repo | Confirm `git remote get-url origin` matches `<org>/<project_name>`; if not, tell the human to restart the session on the correct repo |
| Seed validation fails (script exit 1) | Read the script's error output; fix the seed field; re-run the script |
| Script fails mid-way | Delete the bootstrap/init branch (`git branch -D bootstrap/init`), fix the error, and re-run the script from scratch |
| `gh pr create` returns 422 | `main` wasn't pushed to the remote before opening the PR — run `git push origin main` first |
| `terraform.tfvars` appears in commit | Run `git rm --cached infra/gcp/dev/terraform.tfvars && git commit -m "fix: untrack terraform.tfvars"` |
| Cloud auth fails | Show auth steps for chosen cloud; halt |
| IaC apply fails | Display the Terraform/Bicep error; propose fix; wait for human approval before retrying |
| Any unexpected error | Halt; do not attempt partial fixes; report state clearly |

---

## What This Skill Does NOT Do

- Create GitHub repositories — the human must do this before starting the session
- Generate files manually — `scripts/bootstrap.js` is the only source of project files
- Provision staging or production environments
- Scaffold feature code — only the project skeleton

---

*Skill version: 0.8 | Workflow version: 0.9 | Last updated: 2026-06-15*
*Changes in 0.8: script now creates `main` branch (empty init commit) automatically when no branches exist, then branches `bootstrap/init` from it — no more manual guard needed in Step 5; push instructions updated to push both `main` and `bootstrap/init`.*
*Changes in 0.7: pilot feedback — explicit "never scaffold manually" rule in intro; Step 5 documented empty-main-branch guard and terraform.tfvars verification; `.gitignore` moved to first file written in bootstrap.js.*
*Changes in 0.6: AI role reduced to seed collection only; all file generation moved to `scripts/bootstrap.js`; BOOTSTRAP_SKILL.md no longer contains inline file content.*
*Changes in 0.5: session-on-target-repo invocation model; Step 0 clones workflow repo locally.*
*Changes in 0.4: user-creates-repo-upfront flow; agent prompts human with exact repo settings.*
*Changes in 0.3: `skip_provisioning` mode; `jose` auth clarification; MCP repo creation fallback.*
