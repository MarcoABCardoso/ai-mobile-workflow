# ADR 010 — Optional addon model

**Status:** Accepted  
**Date:** 2026-06-15

## Context

Not every app needs push notifications, real-time streaming, or webhook ingestion. Provisioning all of these for every project adds cost, complexity, and surface area that most projects don't need. But when an app *does* need one of these capabilities, there should be a single, opinionated way to add it rather than having the AI invent an approach from scratch.

## Decision

A project declares the capabilities it needs in `bootstrap-seed.json` under an `addons` key. The bootstrap skill reads this list and conditionally scaffolds code and provisions resources only for the declared addons. Everything else stays out of the project.

```json
{
  "addons": ["push-notifications", "realtime", "webhooks"]
}
```

`addons` defaults to `[]`. Any combination is valid. Order does not matter.

## Available addons

| Addon | What it provides | Additional cloud resources |
|---|---|---|
| `push-notifications` | Device token registration, FCM/ANH send helper, mobile token registration | Azure: Notification Hub · GCP: none (FCM via existing Firebase) |
| `realtime` | SSE route helper (server→client push), mobile `useServerEvents` hook | Azure: none · GCP: extended Cloud Run timeout |
| `webhooks` | HMAC-validated inbound webhook routes, raw body parsing | None |

## How the bootstrap skill handles addons

1. **Step 1 (plan):** display which addons are enabled in the confirmation summary.
2. **Step 3 (scaffold):** generate addon-specific source files conditionally — see each addon ADR for the exact files.
3. **Step 5 (provision):** apply addon-specific IaC changes and store any new secrets (e.g. Notification Hub connection string).
4. **`CLAUDE.md` (generated):** list enabled addons so the AI knows which patterns to use in future sessions.

## Guiding principles

- **Don't provision what you don't declare.** A project with no addons gets a clean baseline with no notification infrastructure, no SSE routes, no webhook endpoints.
- **Addons are all-or-nothing per capability.** There is no partial push-notifications configuration — you either have the full scaffold or none of it. This keeps the baseline simple.
- **Adding an addon after bootstrap is a manual process.** The skill only runs addons at bootstrap time. If a capability is added later, follow the relevant ADR manually.

## Trade-offs

- Requires the human to anticipate needed capabilities at bootstrap time. Missing an addon means manual addition later, which the skill doesn't cover. This is intentional — the bootstrap is a one-time setup, and the manual path is documented in each addon ADR.
- Future addons (e.g. file storage, search, email) follow the same pattern: add to the enum, write an ADR, add scaffold + IaC.
