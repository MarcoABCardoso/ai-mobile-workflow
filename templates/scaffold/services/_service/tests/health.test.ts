import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { app } from '../src/index.js'

beforeAll(() => app.ready())
afterAll(() => app.close())

describe('health', () => {
  it('returns ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ok' })
  })
})
