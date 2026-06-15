import fp from 'fastify-plugin'
import type { FastifyReply } from 'fastify'

type Subscriber = { userId: string; reply: FastifyReply }
const subscribers: Subscriber[] = []

declare module 'fastify' {
  interface FastifyInstance {
    sse: {
      subscribe(userId: string, reply: FastifyReply): void
      push(userId: string, event: string, data: unknown): void
    }
  }
}

export default fp(async (fastify) => {
  fastify.decorate('sse', {
    subscribe(userId: string, reply: FastifyReply) {
      subscribers.push({ userId, reply })
      reply.raw.on('close', () => {
        const idx = subscribers.findIndex(s => s.reply === reply)
        if (idx !== -1) subscribers.splice(idx, 1)
      })
    },
    push(userId: string, event: string, data: unknown) {
      subscribers
        .filter(s => s.userId === userId)
        .forEach(s => s.reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
    },
  })
})
