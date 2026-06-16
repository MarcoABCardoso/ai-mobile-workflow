import type { FastifyPluginAsync } from 'fastify'

const devices: FastifyPluginAsync = async (fastify) => {
  fastify.post('/devices/register', {
    preHandler: [fastify.authenticate],
    schema: {
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['token', 'platform'],
        properties: {
          token:    { type: 'string' },
          platform: { type: 'string', enum: ['ios', 'android'] },
        },
      },
      response: { 200: { type: 'object', properties: { ok: { type: 'boolean' } } } },
    },
  }, async (request) => {
    // TODO: upsert token in db.deviceTokens keyed by request.user.sub
    return { ok: true }
  })
}
export default devices
