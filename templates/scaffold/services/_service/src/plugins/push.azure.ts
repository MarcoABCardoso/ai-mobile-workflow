import { NotificationHubsClient } from '@azure/notification-hubs'
import fp from 'fastify-plugin'

const client = new NotificationHubsClient(
  process.env.ANH_CONNECTION_STRING!,
  process.env.ANH_HUB_NAME!,
)

declare module 'fastify' {
  interface FastifyInstance {
    push: { send(token: string, platform: 'apns' | 'fcm', title: string, body: string): Promise<void> }
  }
}

export default fp(async (fastify) => {
  fastify.decorate('push', {
    async send(token: string, platform: 'apns' | 'fcm', title: string, body: string) {
      await client.sendNotification(
        platform === 'apns'
          ? { kind: 'apple', body: JSON.stringify({ aps: { alert: { title, body } } }) }
          : { kind: 'firebase', body: JSON.stringify({ message: { notification: { title, body }, token } }) },
      )
    },
  })
})
