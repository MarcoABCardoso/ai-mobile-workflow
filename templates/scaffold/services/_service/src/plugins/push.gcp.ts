import { getMessaging } from 'firebase-admin/messaging'
import fp from 'fastify-plugin'

declare module 'fastify' {
  interface FastifyInstance {
    push: { send(token: string, title: string, body: string): Promise<void> }
  }
}

export default fp(async (fastify) => {
  fastify.decorate('push', {
    async send(token: string, title: string, body: string) {
      await getMessaging().send({ token, notification: { title, body } })
    },
  })
})
