import fp from 'fastify-plugin'
import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import { createRemoteJWKSet, jwtVerify } from 'jose'

const B2C_TENANT  = process.env.AZURE_AD_B2C_TENANT_NAME!
const B2C_POLICY  = process.env.AZURE_AD_B2C_POLICY_NAME!
const B2C_CLIENT  = process.env.AZURE_AD_B2C_CLIENT_ID!

const JWKS_URI = `https://${B2C_TENANT}/${B2C_TENANT}/${B2C_POLICY}/discovery/v2.0/keys`
const ISSUER   = `https://${B2C_TENANT}/${B2C_TENANT}/${B2C_POLICY}/v2.0/`

const jwks = createRemoteJWKSet(new URL(JWKS_URI))

declare module 'fastify' {
  interface FastifyRequest {
    user: { sub: string; email?: string }
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest) => Promise<void>
  }
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate('authenticate', async (request: FastifyRequest) => {
    const auth = request.headers.authorization
    if (!auth?.startsWith('Bearer ')) throw fastify.httpErrors.unauthorized('Missing token')
    const token = auth.slice(7)
    const { payload } = await jwtVerify(token, jwks, { issuer: ISSUER, audience: B2C_CLIENT })
    request.user = { sub: payload.sub as string, email: payload.email as string | undefined }
  })
}

export default fp(authPlugin)
