import type { FastifyPluginAsync } from 'fastify'

const eventsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/events', {
    preHandler: [fastify.authenticate],
    schema: {
      security: [{ bearerAuth: [] }],
      description: 'Server-Sent Events stream for real-time family presence updates',
      response: {
        200: { type: 'string', description: 'text/event-stream' },
      },
    },
  }, async (request, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    })
    reply.raw.write(': connected\n\n')
    fastify.subscribeClient(request.user.sub, reply)
    return reply
  })
}

export default eventsRoute
