import fp from 'fastify-plugin'
import { createHmac, timingSafeEqual } from 'crypto'

declare module 'fastify' {
  interface FastifyInstance {
    verifyWebhookSignature(payload: Buffer, signature: string, secret: string): boolean
  }
}

export default fp(async (fastify) => {
  fastify.decorate('verifyWebhookSignature', (payload: Buffer, signature: string, secret: string) => {
    const expected = 'sha256=' + createHmac('sha256', secret).update(payload).digest('hex')
    const a = Buffer.from(signature)
    const b = Buffer.from(expected)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  })
})
