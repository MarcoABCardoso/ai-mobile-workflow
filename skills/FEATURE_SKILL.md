# Skill: Feature Development

**Invocation:** `claude feature "<ticket description or ID>"`
**Version:** 0.1
**Scope:** Use within a bootstrapped project repository only. Requires `CLAUDE.md`, `infra/budget.json`, and `infra/bootstrap.json` to be present.

---

## Purpose

This skill takes a feature description or ticket and drives it from a blank branch to a reviewed, tested, visualized pull request — autonomously. The human's job is to provide the brief and review the PR. Everything in between is owned by the AI.

---

## Pre-flight Checklist

Before starting, verify the following. Report all failures at once.

- [ ] Running inside the project dev container (`.devcontainer/` present and container is active)
- [ ] Running inside a bootstrapped project (`.git`, `CLAUDE.md`, `turbo.json` all present)
- [ ] `infra/budget.json` exists and `monthly_cap` is set
- [ ] Current cloud spend is below 100% of cap (query billing API or estimate from known resources)
- [ ] `main` branch is up to date — pull before branching
- [ ] No existing branch for this feature (avoid duplicate work)

---

## Execution Steps

### Step 1 — Understand the brief

Parse the feature description. If it came from a ticket ID, look for a `tickets/` directory or ask the human to paste the ticket content.

Produce a **feature plan** and show it to the human before writing any code:

```
FEATURE PLAN
────────────────────────────────────────────────
Feature:   <name>
Branch:    feature/<slug>

What this touches:
  Mobile:    <screens / components affected>
  Service:   <which service(s), if any>
  Shared:    <shared types or API client changes>
  Infra:     <new cloud resources needed, or "none">
  Auth:      <does this require authenticated routes? yes/no>

New cloud resources:              <list or "none">
Estimated additional cost:        $X/month  (Y% of remaining headroom)

Tests I will write:
  Unit:        <list>
  Integration: <list>
  E2E:         <list>

Open questions (need human input before I start):
  1. <question if any>

Estimated steps: ~N  |  Proceed? (yes / adjust)
```

Wait for confirmation or adjustments. Do not write any code before this is approved.

If new cloud resources are needed: apply the same resource plan approval gate from the bootstrap skill before proceeding.

---

### Step 2 — Create feature branch

```bash
git checkout main && git pull
git checkout -b feature/<slug>
```

Slug is derived from the feature name: lowercase, hyphens, max 40 chars.

---

### Step 3 — Implement

Work in this order, committing at each logical boundary:

1. **Shared types first** — any new types, API client methods, or contracts go in `/shared` before any consumer touches them. This prevents import errors mid-implementation.

2. **Backend service(s)** — implement the API endpoint(s), business logic, and data layer. If auth is required, use the project's auth middleware (derived from `bootstrap.json` → `cloud`):
   - Azure: validate Azure AD B2C JWT via `@azure/msal-node` middleware
   - GCP: validate Firebase Auth JWT via `firebase-admin` middleware
   Never implement custom auth logic. Always use the provider SDK.

3. **Mobile screens and components** — implement UI consuming the updated shared API client.

4. **Wiring** — connect mobile to backend via the shared API client; ensure environment config (`.env`) is updated if new endpoints were added.

**Commit style:** small, atomic commits with conventional commit messages:
```
feat(api): add POST /items endpoint
feat(mobile): add ItemCreateScreen
feat(shared): add CreateItemRequest type
```

**During implementation, the AI must:**
- Never hardcode secrets or API keys — use the secrets store
- Never add a dependency without checking if it already exists in the workspace
- Flag any decision that has meaningful architectural implications as a comment and in the PR description

---

### Step 4 — Write tests

Tests are written after the implementation skeleton exists but before the final implementation is complete (not as an afterthought). Each test file lives alongside the code it tests.

#### Unit tests

For each new function, class, or hook with meaningful logic:

```typescript
// services/api/src/items/items.service.test.ts
describe('ItemsService', () => {
  it('should return paginated items for authenticated user', ...)
  it('should throw 403 if user does not own the resource', ...)
  it('should handle empty result set gracefully', ...)
})
```

Run after writing:
```bash
turbo test --filter=<service-name>
```

Iterate until green. Do not proceed with failing unit tests.

#### Integration tests

For each new API endpoint:
```typescript
// services/api/tests/integration/items.test.ts
describe('POST /items', () => {
  it('returns 201 and created item with valid auth token', ...)
  it('returns 401 with missing auth token', ...)
  it('returns 422 with invalid payload', ...)
})
```

Run against a local instance of the service (start it in the background for the test run):
```bash
turbo test:integration --filter=<service-name>
```

#### Mobile component tests

For each new screen or non-trivial component:
```typescript
// mobile/components/__tests__/ItemCard.test.tsx
describe('ItemCard', () => {
  it('renders item name and description', ...)
  it('calls onPress when tapped', ...)
  it('shows loading skeleton when data is undefined', ...)
})
```

Run:
```bash
turbo test --filter=mobile
```

---

### Step 5 — Visualize the frontend

All visualization runs inside the dev container except iOS, which is CI-only. Run levels in order — each level is faster than the next, so stop as soon as the feature's visual requirements are satisfied. iOS and Android are always required before the PR is raised regardless.

#### Level 1 — Expo web (always run first, dev container)

```bash
cd mobile && npx expo start --web --non-interactive &
sleep 5
npx playwright screenshot http://localhost:8081/<route> .ai-artifacts/screenshots/web-preview.png
```

Review the screenshot. If layout is wrong, fix and re-capture before continuing. Port 8081 is forwarded by the dev container so this also works in VS Code remote.

#### Level 2 — Storybook (for new/modified components, dev container)

Add a story for every new component before screenshotting:
```typescript
// mobile/components/ItemCard.stories.tsx
export default { title: 'ItemCard', component: ItemCard }
export const Default = { args: { name: 'Example', description: '...' } }
export const Loading = { args: { name: undefined } }
export const Error  = { args: { error: 'Failed to load' } }
```

```bash
cd mobile && npx storybook --ci &
sleep 8
npx playwright screenshot \
  http://localhost:6006/?path=/story/itemcard--default \
  .ai-artifacts/screenshots/storybook-default.png
npx playwright screenshot \
  http://localhost:6006/?path=/story/itemcard--loading \
  .ai-artifacts/screenshots/storybook-loading.png
```

#### Level 3 — Android Emulator (dev container, if KVM available; otherwise CI)

```bash
# Check KVM availability
if [ -e /dev/kvm ]; then
  emulator -avd Pixel_6_API_33 -no-audio -no-window &
  sleep 60
  adb wait-for-device
  cd mobile && npx expo run:android
  sleep 30
  adb exec-out screencap -p > .ai-artifacts/screenshots/android-preview.png
else
  echo "KVM not available — Android will be validated in CI"
fi
```

#### Level 4 — iOS Simulator (CI only — GitHub Actions macOS runner)

iOS is never run locally. It is validated automatically by the CI workflow when the PR is raised. The AI waits for CI to complete, then downloads and reviews the uploaded artifacts before marking the feature complete.

The CI job (`ci.yml`) handles:
```yaml
ios-preview:
  runs-on: macos-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with: { node-version: 20, cache: npm }
    - uses: expo/expo-github-action@v8
      with: { expo-version: latest, token: ${{ secrets.EXPO_TOKEN }} }
    - run: npm ci
    - run: cd mobile && npx expo run:ios --device "iPhone 15"
    - run: sleep 30
    - run: xcrun simctl io booted screenshot .ai-artifacts/screenshots/ios-preview.png
    - uses: actions/upload-artifact@v4
      with:
        name: ios-screenshots                              # ← artifact name
        path: .ai-artifacts/screenshots/ios-preview.png   # ← artifact path
        retention-days: 14
```

**Waiting for CI and retrieving artifacts:**

After the PR is raised (Step 7), poll for the run and download all artifacts:

```bash
# Get the run ID for this branch
RUN_ID=$(gh run list --branch feature/<slug> --json databaseId --jq '.[0].databaseId')

# Block until all jobs complete (or fail)
gh run watch "$RUN_ID"

# Check overall conclusion
CONCLUSION=$(gh run view "$RUN_ID" --json conclusion --jq '.conclusion')
echo "CI result: $CONCLUSION"   # expected: success

# Download artifacts — exact names must match what ci.yml uploads
gh run download "$RUN_ID" --name ios-screenshots         --dir .ai-artifacts/screenshots/
gh run download "$RUN_ID" --name android-screenshots     --dir .ai-artifacts/screenshots/
gh run download "$RUN_ID" --name expo-web-screenshots    --dir .ai-artifacts/screenshots/
gh run download "$RUN_ID" --name unit-test-results       --dir .ai-artifacts/test-results/unit/
gh run download "$RUN_ID" --name integration-test-results --dir .ai-artifacts/test-results/integration/
```

**CI artifact reference (matches `ci.yml` exactly):**

| Artifact name | Uploaded path | What to check |
|---|---|---|
| `ios-screenshots` | `.ai-artifacts/screenshots/ios-preview.png` | Layout on iPhone 15 — compare to feature brief |
| `android-screenshots` | `.ai-artifacts/screenshots/android-preview.png` | Layout on Nexus 6 — compare to feature brief |
| `expo-web-screenshots` | `.ai-artifacts/screenshots/web-home.png` | Web preview — baseline route |
| `unit-test-results` | `**/coverage/**` | Coverage report — check for unexpected drops |
| `integration-test-results` | `**/test-results/**` | Test output — all suites green |

If CI fails: read the log (`gh run view "$RUN_ID" --log-failed`), fix the root cause, push to the branch, and wait for the new run. Iterate up to 3 times before escalating to the human.

**After each level:** describe what the screenshot shows, compare to the feature brief, and self-correct before moving to the next level. All screenshots are saved to `.ai-artifacts/screenshots/` and embedded in the PR body.

---

### Step 6 — Self-critique pass

Before raising the PR, the AI runs through this checklist internally:

**Correctness**
- [ ] All tests pass (`turbo test lint`)
- [ ] No TypeScript errors (`turbo build`)
- [ ] API contract matches OpenAPI spec — update `openapi.yaml` if endpoints changed
- [ ] Auth is enforced on all endpoints that require it

**Code quality**
- [ ] No hardcoded strings that should be constants or config
- [ ] No dead code left from iteration
- [ ] No `console.log` or debug statements
- [ ] Dependencies added to the right `package.json` (workspace vs root)

**Mobile**
- [ ] Screen works at small (iPhone SE) and large (iPhone 15 Pro Max) sizes — capture both
- [ ] Loading, empty, and error states are all handled — not just the happy path
- [ ] No layout shift or overflow visible in screenshots

**Backend**
- [ ] All new endpoints return consistent error shapes
- [ ] Input validation is present on all POST/PUT/PATCH endpoints
- [ ] No N+1 query patterns introduced

**Cost**
- [ ] No new cloud resources were provisioned beyond what was in the approved plan
- [ ] Current spend is still within budget

If any item fails, fix it before raising the PR. If an item cannot be fixed without human input, note it clearly in the PR.

---

### Step 7 — Raise the PR

```bash
git push origin feature/<slug>
gh pr create \
  --base main \
  --head feature/<slug> \
  --title "<type>: <feature name>" \
  --body "$(generate PR body — see template below)"
```

**PR body template:**

```markdown
## What this does
<1–3 sentence plain-English description>

## Changes
- **Mobile:** <what changed>
- **Service (<name>):** <what changed>
- **Shared:** <what changed>
- **Infra:** <new resources, or "none">

## Auth
<Does this feature require authentication? How is it enforced?>

## Tests
| Type | Count | Result |
|------|-------|--------|
| Unit | N | ✅ Pass |
| Integration | N | ✅ Pass |
| Component | N | ✅ Pass |

## Screenshots
### Expo Web
<embed mobile-web-preview.png>

### iOS Simulator
<embed ios-preview.png>

### Android Emulator
<embed android-preview.png>

## Decisions made
<Any architectural choices or trade-offs the reviewer should know about>

## Known limitations / follow-up tickets
<Anything deliberately deferred>

## Checklist
- [x] Tests pass
- [x] No hardcoded secrets
- [x] OpenAPI spec updated (if applicable)
- [x] Budget not exceeded
```

---

### Step 8 — Report to human

```
✅ Feature PR raised.

PR:     https://github.com/<org>/<project>/pull/<N>
Branch: feature/<slug>

Tests:  Unit ✅  Integration ✅  Component ✅
Visual: Expo web ✅  iOS ✅  Android ✅

Budget: ~$X used of $Y cap  (Z% — headroom: $W)

Please review and merge when ready.
```

---

## Mid-Feature Interruption Handling

If the AI hits an unexpected blocker mid-implementation:

1. **Commit current work-in-progress** with `wip:` prefix so nothing is lost
2. **Describe the blocker clearly** — what was expected, what happened, what is needed to continue
3. **State what can and cannot continue** without resolving the blocker
4. **Wait** — do not attempt workarounds that change the agreed feature plan without human sign-off

---

## Budget Guard (runs before every cloud action in this skill)

```
Read infra/budget.json
→ monthly_cap missing?       → HALT. Cannot proceed without a spend cap.
→ current spend >= 100%?     → HALT. Feature development may continue for
                                non-cloud work only. Report blocked items.
→ current spend 90–99%?      → CONSERVATIVE. Only provision if strictly
                                required to pass tests. Note cost on every action.
→ current spend 75–89%?      → ALERT. Notify human, continue.
→ current spend < 75%?       → PROCEED autonomously.
```

---

## What This Skill Does NOT Do

- It does not merge PRs — that is always a human action
- It does not deploy to staging or production — that is triggered by CI on merge
- It does not modify `infra/bootstrap.json` or `infra/budget.json`
- It does not create new backend services — adding a new service is a separate bootstrap-level action
- It does not make auth implementation decisions — it always uses the provider configured at bootstrap

---

*Skill version: 0.2 | Workflow version: 0.6 | Last updated: 2026-06-14*
