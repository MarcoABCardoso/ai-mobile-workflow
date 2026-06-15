// scripts/smoke-tests.js
// Runs after every production deployment.
// Fast, minimal — verifies the deployment is alive, not that features work.
//
// Exit code 0 = pass (deploy proceeds)
// Exit code 1 = fail (rollback triggered automatically)

const PRODUCTION_URL    = process.env.PRODUCTION_URL
const SMOKE_TEST_TOKEN  = process.env.SMOKE_TEST_TOKEN
const ANH_CONN_STRING   = process.env.ANH_CONNECTION_STRING
const ANH_HUB_NAME      = process.env.ANH_HUB_NAME

if (!PRODUCTION_URL) {
  console.error('PRODUCTION_URL is not set')
  process.exit(1)
}

const results = []

async function check(name, fn) {
  try {
    await fn()
    results.push({ name, passed: true })
    console.log(`  ✅ ${name}`)
  } catch (err) {
    results.push({ name, passed: false, error: err.message })
    console.error(`  ❌ ${name}: ${err.message}`)
  }
}

async function run() {
  console.log(`\nSmoke tests → ${PRODUCTION_URL}\n`)

  // ── 1. Health checks ──────────────────────────────────────────────────────────────────────────────
  await check('api health check', async () => {
    const res = await fetch(`${PRODUCTION_URL}/health`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = await res.json()
    if (body.status !== 'ok') throw new Error(`Unexpected status: ${body.status}`)
  })

  // ── 2. Auth provider reachable ─────────────────────────────────────────────────────────────────────
  await check('Auth provider reachable', async () => {
    if (!SMOKE_TEST_TOKEN) throw new Error('SMOKE_TEST_TOKEN not set')
    const res = await fetch(`${PRODUCTION_URL}/auth/verify`, {
      headers: { Authorization: `Bearer ${SMOKE_TEST_TOKEN}` },
    })
    if (res.status === 401) throw new Error('Token rejected — auth provider may be unreachable')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  })

  // ── 3. Realtime addon: SSE endpoint ──────────────────────────────────────────────────────────────────
  await check('SSE endpoint reachable', async () => {
    const res = await fetch(`${PRODUCTION_URL}/events`, {
      headers: { Authorization: `Bearer ${SMOKE_TEST_TOKEN}` },
      signal: AbortSignal.timeout(5000),
    })
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`)
    const ct = res.headers.get('content-type') ?? ''
    if (!ct.includes('text/event-stream')) throw new Error(`Expected text/event-stream, got: ${ct}`)
  })

  // ── 4. Push-notifications addon: Notification Hub reachable ──────────────────────────────
  await check('Notification Hub reachable', async () => {
    if (!ANH_CONN_STRING || !ANH_HUB_NAME) throw new Error('ANH env vars not set')
    const { NotificationHubsClient } = await import('@azure/notification-hubs')
    const client = new NotificationHubsClient(ANH_CONN_STRING, ANH_HUB_NAME)
    await client.getNotificationHub({})
  })

  // ── Summary ──────────────────────────────────────────────────────────────────────────────────────────
  const passed = results.filter(r => r.passed).length
  const failed = results.filter(r => !r.passed).length

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`)

  if (failed > 0) {
    console.error('Smoke tests FAILED — rollback will be triggered')
    process.exit(1)
  }

  console.log('Smoke tests PASSED — deployment is live')
  process.exit(0)
}

run().catch(err => {
  console.error('Unexpected error in smoke tests:', err)
  process.exit(1)
})
