import { execSync } from 'node:child_process'
import { loadTestEnv } from './env'

export async function runGlobalTeardown() {
  loadTestEnv()

  const shouldBootstrap = process.env.BILLING_TEST_BOOTSTRAP === '1' || process.env.SYSTEM_TEST_BOOTSTRAP === '1'
  if (!shouldBootstrap) return
  if (process.env.BILLING_TEST_KEEP_SERVICES === '1') return

  execSync('docker compose -f docker-compose.test.yml down -v --remove-orphans', {
    cwd: process.cwd(),
    stdio: 'inherit',
  })
}
