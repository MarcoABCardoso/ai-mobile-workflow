import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'
import {
  NotificationHubsClient,
  createAppleNotification,
  createFcmV1Notification,
} from '@azure/notification-hubs'

declare module 'fastify' {
  interface FastifyInstance {
    push: {
      sendToUser(userId: string, title: string, body: string): Promise<void>
    }
  }
}

const pushPlugin: FastifyPluginAsync = async (fastify) => {
  const client = new NotificationHubsClient(
    process.env.ANH_CONNECTION_STRING!,
    process.env.ANH_HUB_NAME!,
  )

  fastify.decorate('push', {
    async sendToUser(userId: string, title: string, body: string) {
      const tagExpression = `userId:${userId}`

      await Promise.allSettled([
        client.sendNotification(createAppleNotification({
          body: { aps: { alert: { title, body } } },
          headers: { 'apns-priority': '10' },
        }), { tagExpression }),
        client.sendNotification(createFcmV1Notification({
          body: { message: { notification: { title, body } } },
        }), { tagExpression }),
      ])
    },
  })
}

export default fp(pushPlugin)
