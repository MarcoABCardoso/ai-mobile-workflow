import { describe, it, expect, beforeAll } from 'vitest'
import { app } from '../src/index.js'

describe('GET /health', () => {
  beforeAll(() => app.ready())

  it('returns 200 with status ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ok' })
  })
})
