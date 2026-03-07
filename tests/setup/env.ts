import fs from 'node:fs'
import path from 'node:path'

let loaded = false

function parseEnvLine(line: string) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) return null
  const idx = trimmed.indexOf('=')
  if (idx <= 0) return null
  const key = trimmed.slice(0, idx).trim()
  if (!key) return null
  const rawValue = trimmed.slice(idx + 1).trim()
  const unquoted =
    (rawValue.startsWith('"') && rawValue.endsWith('"'))
    || (rawValue.startsWith("'") && rawValue.endsWith("'"))
      ? rawValue.slice(1, -1)
      : rawValue
  return { key, value: unquoted }
}

export function loadTestEnv() {
  if (loaded) return
  loaded = true
  const mutableEnv = process.env as Record<string, string | undefined>
  const setIfMissing = (key: string, value: string) => {
    if (!mutableEnv[key]) {
      mutableEnv[key] = value
    }
  }

  const envPath = path.resolve(process.cwd(), '.env.test')
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8')
    for (const line of content.split('\n')) {
      const pair = parseEnvLine(line)
      if (!pair) continue
      if (mutableEnv[pair.key] === undefined) {
        mutableEnv[pair.key] = pair.value
      }
    }
  }

  setIfMissing('NODE_ENV', 'test')
  setIfMissing('BILLING_MODE', 'OFF')
  setIfMissing('DATABASE_URL', 'mysql://root:root@127.0.0.1:3307/waoowaoo_test')
  setIfMissing('REDIS_HOST', '127.0.0.1')
  setIfMissing('REDIS_PORT', '6380')
}

loadTestEnv()

if (process.env.ALLOW_TEST_NETWORK !== '1' && typeof globalThis.fetch === 'function') {
  const originalFetch = globalThis.fetch
  const allowHosts = new Set(['localhost', '127.0.0.1'])

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const rawUrl =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url
    const parsed = new URL(rawUrl, 'http://localhost')
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      if (!allowHosts.has(parsed.hostname)) {
        throw new Error(`Network blocked in tests: ${parsed.hostname}`)
      }
    }
    return await originalFetch(input, init)
  }) as typeof fetch
}
