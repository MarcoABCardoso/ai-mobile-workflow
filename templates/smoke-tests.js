// scripts/smoke-tests.js
// Runs after every production deployment.
// Fast, minimal — verifies the deployment is alive, not that features work.
// Feature correctness is the pre-merge test suite's job.
//
// Exit code 0 = pass (deploy proceeds)
// Exit code 1 = fail (rollback triggered automatically)

const PRODUCTION_URL = process.env.PRODUCTION_URL;
const SMOKE_TEST_TOKEN = process.env.SMOKE_TEST_TOKEN;

if (!PRODUCTION_URL) {
  console.error('PRODUCTION_URL is not set');
  process.exit(1);
}

const results = [];

async function check(name, fn) {
  try {
    await fn();
    results.push({ name, passed: true });
    console.log(`  ✅ ${name}`);
  } catch (err) {
    results.push({ name, passed: false, error: err.message });
    console.error(`  ❌ ${name}: ${err.message}`);
  }
}

async function run() {
  console.log(`\nSmoke tests → ${PRODUCTION_URL}\n`);

  // ── 1. Health checks ────────────────────────────────────────────────────────
  // Each service exposes GET /health returning { status: 'ok' }
  // Add an entry per service as services are added to the project.
  const services = [
    'api',
    // 'notifications',
  ];

  for (const service of services) {
    await check(`${service} health check`, async () => {
      const res = await fetch(`${PRODUCTION_URL}/${service}/health`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      if (body.status !== 'ok') throw new Error(`Unexpected status: ${body.status}`);
    });
  }

  // ── 2. Auth provider reachable ───────────────────────────────────────────────
  await check('Auth provider reachable', async () => {
    if (!SMOKE_TEST_TOKEN) throw new Error('SMOKE_TEST_TOKEN not set');
    const res = await fetch(`${PRODUCTION_URL}/api/auth/verify`, {
      headers: { Authorization: `Bearer ${SMOKE_TEST_TOKEN}` },
    });
    if (res.status === 401) throw new Error('Token rejected — auth provider may be unreachable');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  });

  // ── 3. Authenticated API call ────────────────────────────────────────────────
  await check('Authenticated API round-trip', async () => {
    const res = await fetch(`${PRODUCTION_URL}/api/ping`, {
      headers: { Authorization: `Bearer ${SMOKE_TEST_TOKEN}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  });

  // ── 4. Mobile bundle served ──────────────────────────────────────────────────
  // Confirms the Expo web build / OTA update URL is reachable.
  await check('Mobile bundle reachable', async () => {
    const res = await fetch(`${PRODUCTION_URL}/mobile/`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  });

  // ── Addon checks ────────────────────────────────────────────────────────────
  // Uncomment each block for the addons declared in bootstrap-seed.json.

  // realtime addon: confirm SSE endpoint opens and returns the correct content-type.
  // await check('SSE endpoint reachable', async () => {
  //   const controller = new AbortController()
  //   const res = await fetch(`${PRODUCTION_URL}/api/events`, {
  //     headers: { Authorization: `Bearer ${SMOKE_TEST_TOKEN}` },
  //     signal: AbortSignal.timeout(5000),
  //   })
  //   controller.abort()
  //   if (res.status !== 200) throw new Error(`HTTP ${res.status}`)
  //   const ct = res.headers.get('content-type') ?? ''
  //   if (!ct.includes('text/event-stream')) throw new Error(`Expected text/event-stream, got: ${ct}`)
  // })

  // push-notifications addon (Azure): confirm Notification Hub namespace is reachable.
  // Requires ANH_CONNECTION_STRING and ANH_HUB_NAME to be set in the runtime environment.
  // await check('Notification Hub reachable', async () => {
  //   const { NotificationHubsClient } = await import('@azure/notification-hubs')
  //   const client = new NotificationHubsClient(
  //     process.env.ANH_CONNECTION_STRING,
  //     process.env.ANH_HUB_NAME,
  //   )
  //   await client.getNotificationHub({})  // lightweight existence check
  // })

  // ── Summary ──────────────────────────────────────────────────────────────────
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    console.error('Smoke tests FAILED — rollback will be triggered');
    process.exit(1);
  }

  console.log('Smoke tests PASSED — deployment is live');
  process.exit(0);
}

run().catch(err => {
  console.error('Unexpected error in smoke tests:', err);
  process.exit(1);
});
