import Fastify from 'fastify'
import sensible from '@fastify/sensible'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import auth from './plugins/auth.js'

export const app = Fastify({ logger: true })

await app.register(sensible)
await app.register(swagger, {
  openapi: {
    info: { title: '{{service_name}}', version: '1.0.0' },
    components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
  },
})
await app.register(swaggerUi, { routePrefix: '/docs' })
await app.register(auth)

app.get('/health', {
  schema: { response: { 200: { type: 'object', properties: { status: { type: 'string' } } } } },
}, async () => ({ status: 'ok' }))

// Register feature route modules here

if (process.env.NODE_ENV !== 'test') {
  await app.listen({ port: {{service_port}}, host: '0.0.0.0' })
}
