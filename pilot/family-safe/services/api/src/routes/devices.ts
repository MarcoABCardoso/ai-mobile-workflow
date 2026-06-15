import type { FastifyPluginAsync } from 'fastify'
import { db } from '../db/index.js'
import { deviceTokens } from '../db/schema.js'

const devicesRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post('/devices/register', {
    preHandler: [fastify.authenticate],
    schema: {
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['token', 'platform'],
        properties: {
          token:    { type: 'string' },
          platform: { type: 'string', enum: ['apns', 'gcm'] },
        },
      },
      response: {
        200: { type: 'object', properties: { success: { type: 'boolean' } } },
      },
    },
  }, async (request) => {
    const { token, platform } = request.body as { token: string; platform: 'apns' | 'gcm' }
    await db
      .insert(deviceTokens)
      .values({ userId: request.user.sub, token, platform })
      .onConflictDoUpdate({ target: deviceTokens.token, set: { userId: request.user.sub } })
    return { success: true }
  })
}

export default devicesRoute
