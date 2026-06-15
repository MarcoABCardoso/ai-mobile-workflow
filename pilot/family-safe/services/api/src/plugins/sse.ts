import fp from 'fastify-plugin'
import type { FastifyPluginAsync, FastifyReply } from 'fastify'

type Subscriber = { userId: string; reply: FastifyReply }

const subscribers: Subscriber[] = []

declare module 'fastify' {
  interface FastifyInstance {
    subscribeClient(userId: string, reply: FastifyReply): void
    pushToUser(userId: string, event: string, data: unknown): void
  }
}

const ssePlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate('subscribeClient', (userId: string, reply: FastifyReply) => {
    subscribers.push({ userId, reply })
    reply.raw.on('close', () => {
      const idx = subscribers.findIndex(s => s.userId === userId && s.reply === reply)
      if (idx !== -1) subscribers.splice(idx, 1)
    })
  })

  fastify.decorate('pushToUser', (userId: string, event: string, data: unknown) => {
    for (const sub of subscribers.filter(s => s.userId === userId)) {
      sub.reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    }
  })
}

export default fp(ssePlugin)
