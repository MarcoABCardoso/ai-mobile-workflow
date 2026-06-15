import createClient from 'openapi-fetch'
import type { paths } from './generated/types.js'

export const apiClient = createClient<paths>({
  baseUrl: process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:3001',
})
