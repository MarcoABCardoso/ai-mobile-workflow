# ADR 013 — Inbound webhook handling (`webhooks` addon)

**Status:** Accepted  
**Date:** 2026-06-15

## Context

Third-party services (payment providers, app stores, RevenueCat, communication platforms) notify projects of async events via HTTP webhooks. Every webhook implementation requires the same boilerplate: receive a POST, validate a signature to reject forged requests, parse the body, handle the event.

## Decision

A shared Fastify plugin (`src/plugins/webhooks.ts`) provides HMAC signature validation and raw body access. Webhook routes live in `src/routes/webhooks/<provider>.ts`. No additional cloud resources are required — this is pure application code.

## What gets scaffolded

**Validation plugin (`src/plugins/webhooks.ts`):**
```typescript
import fp from 'fastify-plugin'
import { createHmac, timingSafeEqual } from 'crypto'

export default fp(async (app) => {
  // Parse the body as a raw Buffer so we can verify the signature before parsing JSON.
  // This content-type parser runs for all webhook routes — non-webhook routes
  // are unaffected because they don't use this plugin's decorator.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (_req, body, done) => done(null, body)
  )

  app.decorate('verifyWebhookSignature', (
    body: Buffer,
    receivedSignature: string,
    secret: string,
    algorithm: 'sha256' | 'sha1' = 'sha256'
  ): boolean => {
    const expected = createHmac(algorithm, secret).update(body).digest('hex')
    // receivedSignature may be prefixed: "sha256=abc123" — strip the prefix
    const received = receivedSignature.replace(/^(sha256|sha1)=/, '')
    try {
      return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received, 'hex'))
    } catch {
      return false  // mismatched lengths → not equal
    }
  })
})
```

**Example webhook route (`src/routes/webhooks/stripe.ts`):**
```typescript
import type { FastifyInstance } from 'fastify'

export default async function stripeWebhooks(app: FastifyInstance) {
  app.post('/webhooks/stripe', async (req, reply) => {
    const valid = app.verifyWebhookSignature(
      req.body as Buffer,
      req.headers['stripe-signature'] as string ?? '',
      process.env.STRIPE_WEBHOOK_SECRET!,
    )
    if (!valid) return reply.status(401).send({ error: 'Invalid signature' })

    const event = JSON.parse((req.body as Buffer).toString())

    switch (event.type) {
      case 'customer.subscription.created':
        // handle subscription creation
        break
      case 'customer.subscription.deleted':
        // handle cancellation
        break
      default:
        // Unknown event type — acknowledge receipt, take no action
    }

    return reply.status(200).send()
  })
}
```

Register the webhook routes in `src/index.ts`:
```typescript
await app.register(webhookPlugin)
await app.register(stripeWebhooks)
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
