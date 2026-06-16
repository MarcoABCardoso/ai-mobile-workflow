import type { FastifyPluginAsync } from 'fastify'

const events: FastifyPluginAsync = async (fastify) => {
  fastify.get('/events', {
    preHandler: [fastify.authenticate],
    schema: { security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    fastify.sse.subscribe(request.user.sub, reply)
  })
}
export default events
