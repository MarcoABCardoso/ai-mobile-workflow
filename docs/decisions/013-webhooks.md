# ADR 013 — Inbound webhook handling (`webhooks` addon)

**Status:** Accepted  
**Date:** 2026-06-15

## Context

Third-party services (payment providers, app stores, RevenueCat, communication platforms) notify projects of async events via HTTP webhooks. Every webhook implementation requires the same boilerplate: receive a POST, validate a signature to reject forged requests, parse the body, handle the event.

## Decision

A shared Fastify plugin (`src/plugins/webhooks.ts`) provides HMAC signature validation and raw body access. Webhook routes live in `src/routes/webhooks/<provider>.ts`. No additional cloud resources are required — this is pure application code.

## What gets scaffolded

**Signature utility (`src/plugins/webhooks.ts`) — plain function, not a Fastify plugin:**
```typescript
import { createHmac, timingSafeEqual } from 'crypto'

// Exported as a plain function, not a Fastify decorator, so it can be imported
// directly into route handlers without requiring a global plugin registration.
export function verifyWebhookSignature(
  body: Buffer,
  receivedSignature: string,
  secret: string,
  algorithm: 'sha256' | 'sha1' = 'sha256'
): boolean {
  const expected = createHmac(algorithm, secret).update(body).digest('hex')
  // receivedSignature may be prefixed: "sha256=abc123" — strip it
  const received = receivedSignature.replace(/^(sha256|sha1)=/, '')
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received, 'hex'))
  } catch {
    return false  // mismatched lengths → not equal
  }
}
```

**Webhook route scope (`src/routes/webhooks/index.ts`) — encapsulated Fastify plugin:**
```typescript
import type { FastifyInstance } from 'fastify'
import { verifyWebhookSignature } from '../../plugins/webhooks'

// IMPORTANT: do NOT wrap with fastify-plugin (fp()). This plugin is intentionally
// encapsulated so that addContentTypeParser only applies within this scope and
// does not override JSON parsing for the rest of the application.
export default async function webhookRoutes(app: FastifyInstance) {
  // Buffer parsing scoped to this plugin only — non-webhook routes are unaffected
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (_req, body, done) => done(null, body)
  )

  app.post('/webhooks/stripe', async (req, reply) => {
    const valid = verifyWebhookSignature(
      req.body as Buffer,
      req.headers['stripe-signature'] as string ?? '',
      process.env.STRIPE_WEBHOOK_SECRET!,
    )
    if (!valid) return reply.status(401).send({ error: 'Invalid signature' })

    const event = JSON.parse((req.body as Buffer).toString())

    switch (event.type) {
      case 'customer.subscription.created':
        break
      case 'customer.subscription.deleted':
        break
    }

    return reply.status(200).send()
  })

  // Add more providers here: app.post('/webhooks/revenuecat', ...)
}
```

Register the webhook scope in `src/index.ts` — no `fp()` wrapping at the call site either:
```typescript
await app.register(webhookRoutes)  // encapsulation preserved — JSON routes unaffected
```

**Exclude webhook routes from the generated OpenAPI spec** — they are not called by the mobile client and do not fit the JSON request/response model. Use Fastify's `hide` schema property:
```typescript
app.post('/webhooks/stripe', {
  schema: { hide: true },  // omit from openapi.yaml
}, handler)
```

## Secret storage

Webhook signing secrets are stored in the project secrets store, never hardcoded:
- **GCP:** `gcloud secrets versions add <project>-dev-config --data-file=-` — add `STRIPE_WEBHOOK_SECRET` as a separate secret or as a field in the config secret.
- **Azure:** `az keyvault secret set --vault-name "$KV_NAME" --name "STRIPE-WEBHOOK-SECRET" --value "..."`.

The secret name convention is `<PROVIDER>_WEBHOOK_SECRET` in the env (e.g. `STRIPE_WEBHOOK_SECRET`, `REVENUECAT_WEBHOOK_SECRET`).

## Signature algorithm by provider

| Provider | Header | Algorithm | Prefix |
|---|---|---|---|
| Stripe | `stripe-signature` | SHA-256 | `sha256=` |
| RevenueCat | `x-revenuecat-signature` | SHA-256 | none |
| Apple App Store | `x-apple-authorization` | Different — use Apple's JWT validation library | — |
| Google Play | — | No standard signature; validate at application level | — |

> Apple and Google use non-HMAC webhook validation. For these, use their official SDKs rather than the generic `verifyWebhookSignature` helper.

## What this does NOT include

- Retry handling: third-party providers retry failed webhooks automatically. Returning 200 quickly is the most important thing — process the event asynchronously if needed (queue or background job).
- Idempotency: most providers send a unique event ID. Store processed event IDs to deduplicate retries.
- Queue-backed processing: for events that trigger heavy work, acknowledge the webhook immediately (200 OK) and enqueue the work. This is a per-feature concern, not part of the addon scaffold.

## Trade-offs

- Parsing the body as a raw Buffer (required for signature validation) conflicts with the default JSON body parser. The plugin registers a content-type parser override. Routes that receive webhooks must be in the same Fastify scope as the plugin registration — register the webhook plugin on a scoped sub-app if this causes conflicts with other JSON routes.
- No additional cloud resources means no cost, but also no managed webhook delivery (retries, monitoring). For production, consider a service like Hookdeck or Svix for delivery guarantees — both fit the "delegate to third-party specialists" principle.
