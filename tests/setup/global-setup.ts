import { execSync } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { Client } from 'pg'
import { loadTestEnv } from './env'
import { runGlobalTeardown } from './global-teardown'

function parseDbUrl(dbUrl: string) {
  const url = new URL(dbUrl)
  return {
    host: url.hostname,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ''),
    ssl: url.searchParams.get('sslmode') === 'require',
  }
}

async function waitForPostgres(maxAttempts = 180) {
  const db = parseDbUrl(process.env.DATABASE_URL || '')

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const client = new Client({
      host: db.host,
      port: db.port,
      user: db.user,
      password: db.password,
      database: db.database,
      ssl: db.ssl ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: 5_000,
    })

    try {
      await client.connect()
      await client.query('SELECT 1')
      await client.end()
      return
    } catch {
      try {
        await client.end()
      } catch {}
      await sleep(1_000)
    }
  }

  throw new Error('PostgreSQL test service did not become ready in time')
}

export default async function globalSetup() {
  loadTestEnv()

  const shouldBootstrap = process.env.BILLING_TEST_BOOTSTRAP === '1' || process.env.SYSTEM_TEST_BOOTSTRAP === '1'
  if (!shouldBootstrap) {
    return async () => {}
  }

  execSync('docker compose -f docker-compose.test.yml down -v --remove-orphans', {
    cwd: process.cwd(),
    stdio: 'inherit',
  })

  execSync('docker compose -f docker-compose.test.yml up -d --remove-orphans', {
    cwd: process.cwd(),
    stdio: 'inherit',
  })

  await waitForPostgres()

  execSync('npx prisma db push --skip-generate --schema prisma/schema.prisma', {
    cwd: process.cwd(),
    stdio: 'inherit',
  })

  return async () => {
    await runGlobalTeardown()
  }
}
