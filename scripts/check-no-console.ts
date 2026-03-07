import { execSync } from 'node:child_process'

const ALLOWLIST = new Set<string>([
  'src/lib/logging/core.ts',
  'src/lib/logging/config.ts',
  'src/lib/logging/context.ts',
  'src/lib/logging/redact.ts',
  'scripts/check-no-console.ts',
  'scripts/guards/no-api-direct-llm-call.mjs',
  'scripts/guards/no-internal-task-sync-fallback.mjs',
  'scripts/guards/no-media-provider-bypass.mjs',
  'scripts/guards/no-server-mirror-state.mjs',
  'scripts/guards/task-loading-guard.mjs',
  'scripts/guards/task-target-states-no-polling-guard.mjs',
])

function run(cmd: string): string {
  try {
    return execSync(cmd, { encoding: 'utf8' })
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'stdout' in error) {
      const stdout = (error as { stdout?: unknown }).stdout
      return typeof stdout === 'string' ? stdout : ''
    }
    return ''
  }
}

function main() {
  const output = run(`rg -n "console\\\\.(log|info|warn|error|debug)\\\\(" src scripts`)
  const lines = output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const violations = lines.filter((line) => {
    const file = line.split(':', 1)[0]
    return !ALLOWLIST.has(file)
  })

  if (violations.length > 0) {
    process.stderr.write('[check:logs] found forbidden console usage:\n')
    for (const line of violations) {
      process.stderr.write(`- ${line}\n`)
    }
    process.exit(1)
  }

  process.stdout.write(`[check:logs] ok scanned=${lines.length} allowlist=${ALLOWLIST.size}\n`)
}

main()
