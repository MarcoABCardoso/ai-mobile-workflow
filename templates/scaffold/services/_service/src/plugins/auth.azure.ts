import fp from 'fastify-plugin'
import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import { createRemoteJWKSet, jwtVerify } from 'jose'

const B2C_TENANT = process.env.AZURE_AD_B2C_TENANT_NAME!
const B2C_POLICY = process.env.AZURE_AD_B2C_POLICY_NAME!
const B2C_CLIENT = process.env.AZURE_AD_B2C_CLIENT_ID!
const jwks = createRemoteJWKSet(new URL(
  `https://${B2C_TENANT}/${B2C_TENANT}/${B2C_POLICY}/discovery/v2.0/keys`,
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
      issuer:   `https://${B2C_TENANT}/${B2C_TENANT}/${B2C_POLICY}/v2.0/`,
      audience: B2C_CLIENT,
    })
    request.user = { sub: payload.sub as string, email: payload.email as string | undefined }
  })
}
export default fp(authPlugin)
