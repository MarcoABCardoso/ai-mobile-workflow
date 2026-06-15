# ADR 011 — Push notifications (`push-notifications` addon)

**Status:** Accepted  
**Date:** 2026-06-15

## Context

Mobile apps frequently need to notify users of events that happen when the app is in the background or closed. The mechanism differs by platform but the pattern is the same: a server sends a message to a provider (FCM or APNs), which delivers it to the device.

## Decision

- **GCP projects:** Firebase Cloud Messaging (FCM) via `firebase-admin` SDK. No additional cloud resources — FCM is available via the `firebase.googleapis.com` API already enabled in the baseline IaC.
- **Azure projects:** Azure Notification Hubs, provisioned via a conditional Bicep resource when the addon is declared.
- **Mobile:** `expo-notifications` for token registration and foreground notification handling.
- **Pattern:** the app registers a push token at login → posts it to a `/devices/register` endpoint → backend stores token → service sends notifications via the push helper.

## What gets scaffolded

**In each backend service (`src/plugins/push.ts`):**

```typescript
import fp from 'fastify-plugin'

export default fp(async (app) => {
  // GCP — Firebase Cloud Messaging
  const { getMessaging } = await import('firebase-admin/messaging')

  app.decorate('sendPushNotification', async (
    token: string,
    title: string,
    body: string,
    data?: Record<string, string>
  ) => {
    await getMessaging().send({ notification: { title, body }, data, token })
  })
})

// Azure — swap the implementation:
// import { NotificationHubsClient, createAppleNotification, createFcmV1Notification }
//   from '@azure/notification-hubs'
// const client = new NotificationHubsClient(process.env.ANH_CONNECTION_STRING!, process.env.ANH_HUB_NAME!)
```

**Device registration route (add to service routes):**
```typescript
app.post('/devices/register', {
  schema: {
    security: [{ bearerAuth: [] }],
    body: { type: 'object', required: ['token', 'platform'],
      properties: { token: { type: 'string' }, platform: { enum: ['ios', 'android'] } } },
    response: { 204: { type: 'null' } },
  },
}, async (req, reply) => {
  await db.insert(deviceTokens)
    .values({ userId: req.user.id, token: req.body.token, platform: req.body.platform })
    .onConflictDoUpdate({ target: deviceTokens.token, set: { userId: req.user.id } })
  return reply.status(204).send()
})
```

**Drizzle schema addition (`src/db/schema.ts`):**
```typescript
export const deviceTokens = pgTable('device_tokens', {
  token:     text('token').primaryKey(),
  userId:    uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  platform:  text('platform', { enum: ['ios', 'android'] }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
```

**Mobile (`mobile/lib/notifications.ts`):**
```typescript
import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import { apiClient } from '@<project>/api-client'

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false }),
})

export async function registerForPushNotifications(): Promise<void> {
  if (!Device.isDevice) return  // simulators can't receive push notifications

  const { status: existing } = await Notifications.getPermissionsAsync()
  const { status } = existing === 'granted'
    ? { status: existing }
    : await Notifications.requestPermissionsAsync()

  if (status !== 'granted') return

  const { data: token } = await Notifications.getExpoPushTokenAsync()
  await apiClient.POST('/devices/register', {
    body: { token, platform: Platform.OS as 'ios' | 'android' },
  })
}
```

Call `registerForPushNotifications()` after a successful login.

## Bootstrap provisioning (Step 5 addition)

**Azure only** — store the Notification Hub connection string in Key Vault:
```bash
ANH_CONN=$(az notification-hub namespace authorization-rule list-keys \
  --resource-group "$RESOURCE_GROUP" \
  --namespace-name "<project_name>-dev-nh-ns" \
  --notification-hub-name "default" \
  --name DefaultFullSharedAccessSignature \
  --query primaryConnectionString -o tsv)

az keyvault secret set --vault-name "$KV_NAME" \
  --name "ANH-CONNECTION-STRING" --value "$ANH_CONN"
az keyvault secret set --vault-name "$KV_NAME" \
  --name "ANH-HUB-NAME" --value "default"
```

## Trade-offs

- `expo-notifications` uses Expo's push service as a proxy by default. For production at scale, configure direct FCM/APNs credentials in the Expo dashboard to bypass the proxy.
- iOS simulators cannot receive push notifications. The `Device.isDevice` guard in the mobile library handles this silently.
- Azure Notification Hub Free tier supports up to 1M pushes/month — sufficient for all dev and early-production use.
