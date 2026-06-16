#!/usr/bin/env node
/**
 * bootstrap.js — deterministic project scaffolder
 *
 * Run from the root of the (empty) target project repo:
 *   node /tmp/ai-mobile-workflow/scripts/bootstrap.js
 *
 * Reads bootstrap-seed.json in the current directory.
 * Writes all project files, creates the bootstrap/init branch, and commits.
 * Node 20+ required. No external dependencies.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { execSync } from 'child_process'
import { resolve, dirname, join, basename } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const WORKFLOW_DIR = resolve(__dirname, '..')
const PROJECT_DIR = process.cwd()

// ── Helpers ───────────────────────────────────────────────────────────────────

function file(relPath, content) {
  const abs = join(PROJECT_DIR, relPath)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, content, 'utf8')
  console.log('  ✔', relPath)
}

function json(obj) {
  return JSON.stringify(obj, null, 2) + '\n'
}

function run(cmd) {
  console.log('  $', cmd)
  execSync(cmd, { stdio: 'inherit', cwd: PROJECT_DIR })
}

// Substitute {{placeholders}} in content
function sub(content, map) {
  return content.replace(/\{\{(\w+)\}\}/g, (_, k) => map[k] ?? `{{${k}}}`)
}

// Copy a template from the workflow repo, substituting placeholders
function template(srcRel, destRel, map = {}, asIs = false) {
  let content = readFileSync(join(WORKFLOW_DIR, srcRel), 'utf8')
  if (!asIs) content = sub(content, map)
  file(destRel, content)
}

// Copy a scaffold template for a specific service
function svcTemplate(svc, relPath, subs) {
  template(`templates/scaffold/services/_service/${relPath}`, `${svc}/${relPath}`, subs)
}

// Activate or remove [addon:name] blocks in a template file.
// Active addon: uncomment the body lines (strip leading `  // `), remove markers.
// Inactive addon: remove the entire block including markers.
function applyAddons(content, active) {
  const processed = content.replace(
    /[ \t]*\/\/ \[addon:([^\]]+)\]\n([\s\S]*?)[ \t]*\/\/ \[\/addon:\1\][^\n]*/g,
    (_, name, body) => {
      if (active.includes(name)) {
        return body.replace(/^(\s*)\/\/ ?/gm, '$1').trimEnd()
      }
      return ''
    },
  )
  // Normalise runs of 3+ blank lines left by removed blocks
  return processed.replace(/\n{3,}/g, '\n\n')
}

// ── 1. Load and validate seed ─────────────────────────────────────────────────

console.log('\n── bootstrap.js ─────────────────────────────────────────────────\n')

let seed
try {
  seed = JSON.parse(readFileSync(join(PROJECT_DIR, 'bootstrap-seed.json'), 'utf8'))
} catch (e) {
  console.error('❌  Cannot read bootstrap-seed.json:', e.message)
  process.exit(1)
}

const errs = []
if (!/^[a-z][a-z0-9-]{0,31}$/.test(seed.project_name ?? ''))
  errs.push('project_name: lowercase letters/digits/hyphens only, max 32 chars')
if (!['azure', 'gcp'].includes(seed.cloud))
  errs.push('cloud: must be "azure" or "gcp"')
if (!seed.region)
  errs.push('region: required')
if (!Array.isArray(seed.services) || seed.services.length === 0)
  errs.push('services: non-empty array required')
if (!(seed.monthly_budget_usd > 0))
  errs.push('monthly_budget_usd: positive number required')
if (!seed.github?.org)
  errs.push('github.org: required')

if (errs.length) {
  console.error('❌  Seed validation failed:\n' + errs.map(e => '  • ' + e).join('\n'))
  process.exit(1)
}

const P      = seed.project_name
const CLOUD  = seed.cloud
const REGION = seed.region
const SVCS   = seed.services
const BUDGET = seed.monthly_budget_usd
const ORG    = seed.github.org
const ADDONS = seed.addons ?? []
const SKIP   = seed.skip_provisioning ?? false
const AUTH   = CLOUD === 'azure' ? 'azure-ad-b2c' : 'firebase-auth'
const DATE   = new Date().toISOString().slice(0, 10)
const NPM_VERSION = execSync('npm --version', { stdio: 'pipe' }).toString().trim()

// Sanitised reverse-DNS bundle ID: com.<org>.<projectname>
const BUNDLE_ID = `com.${ORG.toLowerCase().replace(/[^a-z0-9]/g, '')}.${P.replace(/-/g, '')}`

const SUBS = {
  project_name:             P,
  cloud:                    CLOUD,
  region:                   REGION,
  services:                 SVCS.join(', '),
  auth_provider:            AUTH,
  bootstrap_date:           DATE,
  registry_url:             SKIP ? '<fill-in-after-provisioning>' : '',
  github_org:               ORG,
  addon_push_notifications: String(ADDONS.includes('push-notifications')),
  addon_realtime:           String(ADDONS.includes('realtime')),
  addon_webhooks:           String(ADDONS.includes('webhooks')),
}

console.log('Project:', P, '|', CLOUD, '|', REGION)
console.log('Services:', SVCS.join(', '))
console.log('Addons:', ADDONS.length ? ADDONS.join(', ') : 'none')
console.log('Skip provisioning:', SKIP)

// ── 2. Git branch ─────────────────────────────────────────────────────────────

console.log('\n── Creating branches ────────────────────────────────────────────\n')

// Ensure main exists locally as the PR base before we branch from it.
// An empty cloned repo (no commits yet) has no branches at all, and local git
// may default to "master". We always want main → bootstrap/init.
let mainExists = false
try {
  execSync('git rev-parse --verify main', { stdio: 'pipe', cwd: PROJECT_DIR })
  mainExists = true
} catch { /* main doesn't exist yet */ }

if (!mainExists) {
  run('git checkout --orphan main')
  run('git commit --allow-empty -m "chore: init"')
  console.log('  ✔ created main branch (empty init commit)')
} else {
  run('git checkout main')
}

run('git checkout -b bootstrap/init')

// Write .gitignore immediately after branch creation, before any other files.
// This guarantees `git add .` never picks up ignored files (e.g. terraform.tfvars)
// regardless of the order in which subsequent files are written.
file('.gitignore', [
  'node_modules/', 'dist/', '.env', '*.pem', '*.key',
  '.turbo/', 'coverage/', 'drizzle/', '.ai-artifacts/',
  ...(CLOUD === 'gcp' ? [
    'infra/gcp/dev/terraform.tfvars',
    'infra/gcp/dev/.terraform/',
    'infra/gcp/dev/*.tfstate',
    'infra/gcp/dev/*.tfstate.backup',
  ] : []),
  '',
].join('\n'))

// ── 3. Templates from workflow repo ───────────────────────────────────────────

console.log('\n── Copying templates ────────────────────────────────────────────\n')

// Git hooks — stored in .git-hooks/ (tracked) and installed via `npm run prepare`
template('templates/scaffold/pre-push', '.git-hooks/pre-push', {}, true)

template('templates/CLAUDE.md.template', 'CLAUDE.md', SUBS)
template('templates/ci.yml', '.github/workflows/ci.yml', {}, true)
template('templates/preview.yml', '.github/workflows/preview.yml', {}, true)
// Cloud-specific deploy workflow — azure or gcp variant, with registry guard
template(`templates/deploy-prod.${CLOUD}.yml`, '.github/workflows/deploy-prod.yml', SUBS)

// smoke-tests.js: substitute placeholders then activate/remove addon blocks
const smokeRaw = readFileSync(join(WORKFLOW_DIR, 'templates/smoke-tests.js'), 'utf8')
file('scripts/smoke-tests.js', applyAddons(sub(smokeRaw, SUBS), ADDONS))

// Skills — copied into the project for the AI working on features
template('skills/FEATURE_SKILL.md',   'skills/FEATURE_SKILL.md',   {}, true)
template('skills/BOOTSTRAP_SKILL.md', 'skills/BOOTSTRAP_SKILL.md', {}, true)

if (CLOUD === 'azure') {
  template('infra/azure/dev/main.bicep',      'infra/azure/dev/main.bicep',      {}, true)
  template('infra/azure/dev/main.bicepparam', 'infra/azure/dev/main.bicepparam', SUBS)
} else {
  template('infra/gcp/dev/main.tf',                   'infra/gcp/dev/main.tf',                   {}, true)
  template('infra/gcp/dev/terraform.tfvars.example',  'infra/gcp/dev/terraform.tfvars',          SUBS)
}

// ── 4. Static project files ───────────────────────────────────────────────────

console.log('\n── Project root files ───────────────────────────────────────────\n')

file('.env.example', [
  '# Copy to .env. Never commit .env.',
  '',
  '# Database',
  `DATABASE_URL=postgres://user:password@localhost:5432/${P}_dev`,
  '',
  CLOUD === 'azure'
    ? '# Azure AD B2C\nAZURE_AD_B2C_TENANT_NAME=\nAZURE_AD_B2C_POLICY_NAME=B2C_1_SignUpSignIn\nAZURE_AD_B2C_CLIENT_ID='
    : '# Firebase Auth\nFIREBASE_PROJECT_ID=',
  '',
  ...(ADDONS.includes('push-notifications') && CLOUD === 'azure'
    ? ['# Azure Notification Hubs', 'ANH_CONNECTION_STRING=', 'ANH_HUB_NAME=default', '']
    : []),
].join('\n'))

file('turbo.json', json({
  $schema: 'https://turbo.build/schema.json',
  tasks: {
    build:              { dependsOn: ['^build'], outputs: ['dist/**'] },
    test:               { dependsOn: ['^build'] },
    'test:integration': { dependsOn: ['^build'] },
    lint:               {},
    dev:                { cache: false, persistent: true },
    generate:           { dependsOn: ['^build'], outputs: ['src/generated/**'] },
  },
}))

file('package.json', json({
  name: P,
  private: true,
  packageManager: `npm@${NPM_VERSION}`,
  workspaces: ['mobile', 'services/*', 'shared/*'],
  scripts: {
    dev:      'turbo run dev',
    build:    'turbo run build',
    test:     'turbo run test',
    lint:     'turbo run lint',
    generate: 'turbo run generate',
    prepare:  'cp .git-hooks/pre-push .git/hooks/pre-push && chmod +x .git/hooks/pre-push',
  },
  devDependencies: { turbo: '^2.0.0', typescript: '^5.4.0' },
}))

file('tsconfig.json', json({
  compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, skipLibCheck: true },
}))

file('infra/bootstrap.json', json({
  project_name: P, cloud: CLOUD, region: REGION, services: SVCS, addons: ADDONS,
  github: seed.github, auth_provider: AUTH, bootstrapped_at: DATE, workflow_version: '0.9',
}))

file('infra/budget.json', json({
  currency: 'USD', monthly_cap: BUDGET, alert_thresholds: [50, 75, 90],
  hard_stop_at_percent: 100, environment: 'development', owner: ORG,
}))

// Dev container
file('.devcontainer/Dockerfile', `FROM mcr.microsoft.com/devcontainers/base:ubuntu-22.04

RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs

RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | \\
    dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg && \\
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | \\
    tee /etc/apt/sources.list.d/github-cli.list && \\
    apt-get update && apt-get install -y gh

${CLOUD === 'azure'
  ? 'RUN curl -sL https://aka.ms/InstallAzureCLIDeb | bash'
  : 'RUN curl https://sdk.cloud.google.com | bash'}

RUN apt-get install -y gnupg software-properties-common && \\
    wget -O- https://apt.releases.hashicorp.com/gpg | gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg && \\
    echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | \\
    tee /etc/apt/sources.list.d/hashicorp.list && apt-get update && apt-get install -y terraform

RUN npm install -g expo-cli && npx playwright install --with-deps chromium

RUN apt-get install -y android-sdk
ENV ANDROID_HOME=/usr/lib/android-sdk
`)

file('.devcontainer/devcontainer.json', json({
  name: `${P}-dev`,
  build: { dockerfile: 'Dockerfile' },
  forwardPorts: [8081, 6006, ...SVCS.map((_, i) => 3001 + i)],
  portsAttributes: {
    '8081': { label: 'Expo Web' },
    '6006': { label: 'Storybook' },
    ...Object.fromEntries(SVCS.map((s, i) => [`${3001 + i}`, { label: `API (${s})` }])),
  },
  postCreateCommand: 'npm install',
  remoteEnv: { CLOUD, PROJECT_NAME: P },
  features: { 'ghcr.io/devcontainers/features/docker-in-docker:2': {} },
}))

// ── 5. Services ───────────────────────────────────────────────────────────────

console.log('\n── Generating services ──────────────────────────────────────────\n')

for (let i = 0; i < SVCS.length; i++) {
  const name = SVCS[i]
  const port = 3001 + i
  const svc  = `services/${name}`
  console.log(`  service: ${name} (port ${port})`)

  const svcSubs = { ...SUBS, service_name: name, service_port: String(port) }

  // Source files — read from templates/scaffold/services/_service/
  svcTemplate(svc, 'src/index.ts',              svcSubs)
  svcTemplate(svc, 'src/db/schema.ts',          svcSubs)
  svcTemplate(svc, 'src/db/index.ts',           svcSubs)
  svcTemplate(svc, 'tests/health.test.ts',      svcSubs)
  svcTemplate(svc, 'scripts/export-openapi.ts', svcSubs)
  svcTemplate(svc, 'openapi.yaml',              svcSubs)
  svcTemplate(svc, 'Dockerfile',                svcSubs)
  svcTemplate(svc, 'drizzle.config.ts',         svcSubs)
  svcTemplate(svc, 'vitest.config.ts',          svcSubs)

  // Auth plugin — cloud-specific template
  template(
    `templates/scaffold/services/_service/src/plugins/auth.${CLOUD}.ts`,
    `${svc}/src/plugins/auth.ts`,
    svcSubs,
  )

  // Addon: push-notifications
  if (ADDONS.includes('push-notifications')) {
    template(
      `templates/scaffold/services/_service/src/plugins/push.${CLOUD}.ts`,
      `${svc}/src/plugins/push.ts`,
      svcSubs,
    )
    svcTemplate(svc, 'src/routes/devices.ts', svcSubs)
  }

  // Addon: realtime (SSE)
  if (ADDONS.includes('realtime')) {
    svcTemplate(svc, 'src/plugins/sse.ts',   svcSubs)
    svcTemplate(svc, 'src/routes/events.ts', svcSubs)
  }

  // Addon: webhooks
  if (ADDONS.includes('webhooks')) {
    svcTemplate(svc, 'src/plugins/webhooks.ts',        svcSubs)
    svcTemplate(svc, 'src/routes/webhooks/.gitkeep',   svcSubs)
  }

  // Integration test placeholder
  svcTemplate(svc, 'tests/integration/.gitkeep', svcSubs)

  const svcDeps = {
    '@fastify/sensible':   '^5.6.0',
    '@fastify/swagger':    '^8.0.0',
    '@fastify/swagger-ui': '^4.0.0',
    'drizzle-orm':         '^0.30.0',
    fastify:               '^4.26.0',
    'fastify-plugin':      '^4.5.0',
    jose:                  '^5.2.0',
    'js-yaml':             '^4.1.0',
    pg:                    '^8.11.0',
    ...(ADDONS.includes('push-notifications') && CLOUD === 'azure' ? { '@azure/notification-hubs': '^1.1.0' } : {}),
    ...(ADDONS.includes('push-notifications') && CLOUD === 'gcp'   ? { 'firebase-admin': '^12.0.0' } : {}),
  }

  file(`${svc}/package.json`, json({
    name: `@${P}/${name}`,
    private: true,
    type: 'module',
    scripts: {
      dev:                `tsx watch src/index.ts`,
      build:              'tsc --noEmit',
      test:               'vitest run --passWithNoTests',
      'test:integration': 'vitest run --passWithNoTests --dir tests/integration',
      'generate:openapi': 'tsx scripts/export-openapi.ts',
      'db:generate':      'drizzle-kit generate',
      'db:migrate':       'drizzle-kit migrate',
    },
    dependencies: svcDeps,
    devDependencies: {
      '@types/js-yaml': '^4.0.0',
      '@types/node':    '^22.0.0',
      '@types/pg':      '^8.10.0',
      'drizzle-kit': '^0.20.0',
      tsx:           '^4.7.0',
      typescript:    '^5.4.0',
      vitest:        '^1.6.0',
    },
  }))

  // rootDir is omitted: build uses --noEmit so rootDir has no effect,
  // and including tests/ + scripts/ in rootDir: src causes TS errors.
  file(`${svc}/tsconfig.json`, json({
    extends: '../../tsconfig.json',
    compilerOptions: { outDir: 'dist' },
    include: ['src/**/*', 'tests/**/*', 'scripts/**/*'],
  }))

}

// ── 6. Mobile ─────────────────────────────────────────────────────────────────

console.log('\n── Generating mobile ────────────────────────────────────────────\n')

const mobileDeps = {
  '@tanstack/react-query':        '^5.32.0',
  expo:                           '~51.0.0',
  'expo-router':                  '~3.5.0',
  react:                          '18.2.0',
  'react-dom':                    '18.2.0',
  'react-native':                 '0.74.0',
  'react-native-safe-area-context': '4.10.5',
  'react-native-screens':         '~3.31.0',
  'react-native-web':             '~0.19.10',
  ...(ADDONS.includes('push-notifications') ? { 'expo-notifications': '~0.28.0' } : {}),
  ...(ADDONS.includes('realtime')           ? { 'react-native-sse': '^1.2.0' }    : {}),
}

file('mobile/package.json', json({
  name: `@${P}/mobile`,
  version: '1.0.0',
  main: 'expo-router/entry',
  scripts: {
    start:   'expo start',
    android: 'expo run:android',
    ios:     'expo run:ios',
    web:     'expo start --web',
    test:    'jest --passWithNoTests',
  },
  dependencies: mobileDeps,
  devDependencies: { '@babel/core': '^7.24.0', '@types/react': '~18.2.0', jest: '^29.0.0', 'jest-expo': '~51.0.0', typescript: '~5.4.0' },
}))

file('mobile/app.json', json({
  expo: {
    name: P,
    slug: P,
    version: '1.0.0',
    orientation: 'portrait',
    platforms: ['ios', 'android', 'web'],
    scheme: P,
    ios:     { bundleIdentifier: BUNDLE_ID },
    android: { package: BUNDLE_ID },
  },
}))

template('templates/scaffold/mobile/__tests__/smoke.test.ts', 'mobile/__tests__/smoke.test.ts', SUBS)
template('templates/scaffold/mobile/app/_layout.tsx',         'mobile/app/_layout.tsx',         SUBS)
template('templates/scaffold/mobile/app/(tabs)/index.tsx',    'mobile/app/(tabs)/index.tsx',    SUBS)

file('mobile/components/.gitkeep', '')

if (ADDONS.includes('realtime')) {
  template('templates/scaffold/mobile/hooks/useServerEvents.ts', 'mobile/hooks/useServerEvents.ts', SUBS)
}

if (ADDONS.includes('push-notifications')) {
  template('templates/scaffold/mobile/lib/notifications.ts', 'mobile/lib/notifications.ts', SUBS)
}

// ── 7. Shared packages ────────────────────────────────────────────────────────

console.log('\n── Generating shared packages ───────────────────────────────────\n')

file('shared/types/package.json', json({ name: `@${P}/types`, private: true, type: 'module', main: 'index.ts' }))
template('templates/scaffold/shared/types/index.ts', 'shared/types/index.ts', SUBS)

file('shared/api-client/package.json', json({
  name: `@${P}/api-client`,
  private: true,
  type: 'module',
  scripts: { generate: `openapi-typescript ../services/${SVCS[0]}/openapi.yaml -o src/generated/types.d.ts` },
  dependencies: { 'openapi-fetch': '^0.10.0' },
  devDependencies: { 'openapi-typescript': '^7.0.0' },
}))

template('templates/scaffold/shared/api-client/src/index.ts',              'shared/api-client/src/index.ts',              SUBS)
template('templates/scaffold/shared/api-client/src/generated/types.d.ts',  'shared/api-client/src/generated/types.d.ts',  SUBS)

// ── 8. PROVISIONING.md (deferred provisioning only) ──────────────────────────

if (SKIP) {
  console.log('\n── Writing PROVISIONING.md ──────────────────────────────────────\n')
  file('PROVISIONING.md', `# Provisioning Runbook — ${P}

Cloud provisioning was deferred at bootstrap time (\`skip_provisioning: true\`).
Follow these steps when credentials are available.

## Prerequisites

${CLOUD === 'azure'
  ? `- \`az login\` and \`az account set --subscription <id>\`\n- Contributor role on the target subscription`
  : `- \`gcloud auth login\` and \`gcloud config set project <id>\`\n- Project Editor or equivalent role`}

## 1. Provision dev baseline

${CLOUD === 'azure'
  ? `\`\`\`bash\naz group create --name ${P}-dev-rg --location ${REGION}\naz deployment group create \\\\\n  --name main --resource-group ${P}-dev-rg \\\\\n  --template-file infra/azure/dev/main.bicep \\\\\n  --parameters infra/azure/dev/main.bicepparam\n\`\`\``
  : `\`\`\`bash\ncd infra/gcp/dev\nterraform init\nterraform apply -auto-approve\n\`\`\``}

## 2. Set up auth provider

See \`skills/BOOTSTRAP_SKILL.md\` Step 4 — Auth provider setup.

## 3. Backfill registry URL

After provisioning, replace \`<fill-in-after-provisioning>\` in:
- \`.github/workflows/deploy-prod.yml\` — \`REGISTRY\` env var
- \`CLAUDE.md\` — cloud_resources table

\`\`\`bash
git commit -am "chore: backfill registry URL after provisioning"
git push origin bootstrap/init
\`\`\`
`)
}

// ── 9. Commit ─────────────────────────────────────────────────────────────────

console.log('\n── Installing dependencies ──────────────────────────────────────\n')
run('npm install')  // generates package-lock.json, required for CI cache: npm

console.log('\n── Committing ───────────────────────────────────────────────────\n')
run('git add .')
run(`git commit -m "chore(bootstrap): scaffold ${P} monorepo"`)

console.log(`
✅  Scaffold complete.

  Branch:   bootstrap/init
  Project:  ${P}
  Cloud:    ${CLOUD} / ${REGION}
  Services: ${SVCS.join(', ')}
  Addons:   ${ADDONS.length ? ADDONS.join(', ') : 'none'}
${SKIP ? '\n  ⚠️  Provisioning deferred — see PROVISIONING.md\n' : ''}
Next:
  git push origin main                    # establish main on the remote (PR base)
  git push -u origin bootstrap/init       # push the scaffold branch
  # Then follow BOOTSTRAP_SKILL.md for provisioning (if not deferred) and opening the PR
`)
