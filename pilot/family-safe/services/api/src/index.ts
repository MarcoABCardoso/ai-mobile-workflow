import Fastify from 'fastify'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import authPlugin from './plugins/auth.js'
import pushPlugin from './plugins/push.js'
import ssePlugin from './plugins/sse.js'
import devicesRoute from './routes/devices.js'
import eventsRoute from './routes/events.js'

export const app = Fastify({ logger: true })

await app.register(swagger, {
  openapi: {
    info: { title: 'family-safe api', version: '1.0.0' },
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
  },
})
await app.register(swaggerUi, { routePrefix: '/docs' })
await app.register(authPlugin)
await app.register(pushPlugin)
await app.register(ssePlugin)
await app.register(devicesRoute)
await app.register(eventsRoute)

app.get('/health', {
  schema: { response: { 200: { type: 'object', properties: { status: { type: 'string' } } } } },
}, async () => ({ status: 'ok' }))

// Register feature route modules here

if (process.env.NODE_ENV !== 'test') {
  await app.listen({ port: 3001, host: '0.0.0.0' })
}
