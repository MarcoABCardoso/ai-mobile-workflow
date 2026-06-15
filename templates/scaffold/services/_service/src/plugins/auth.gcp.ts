import fp from 'fastify-plugin'
import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import { createRemoteJWKSet, jwtVerify } from 'jose'

const FIREBASE_PROJECT = process.env.FIREBASE_PROJECT_ID!
const jwks = createRemoteJWKSet(new URL(
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',
))

declare module 'fastify' {
  interface FastifyRequest { user: { sub: string; email?: string } }
  interface FastifyInstance { authenticate: (req: FastifyRequest) => Promise<void> }
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate('authenticate', async (request: FastifyRequest) => {
    const auth = request.headers.authorization
    if (!auth?.startsWith('Bearer ')) throw fastify.httpErrors.unauthorized()
    const { payload } = await jwtVerify(auth.slice(7), jwks, {
      issuer:   `https://securetoken.google.com/${FIREBASE_PROJECT}`,
      audience: FIREBASE_PROJECT,
    })
    request.user = { sub: payload.sub as string, email: payload.email as string | undefined }
  })
}
export default fp(authPlugin)
