import fs from 'node:fs'

type Rule = {
  file: string
  patterns: string[]
}

const RULES: Rule[] = [
  {
    file: 'src/lib/api-errors.ts',
    patterns: ['x-request-id', 'api.request.start', 'api.request.finish', 'api.request.error'],
  },
  {
    file: 'src/lib/workers/shared.ts',
    patterns: ['worker.start', 'worker.completed', 'worker.failed', 'durationMs', 'errorCode'],
  },
  {
    file: 'src/app/api/sse/route.ts',
    patterns: ['sse.connect', 'sse.replay', 'sse.disconnect'],
  },
  {
    file: 'scripts/watchdog.ts',
    patterns: ['watchdog.started', 'watchdog.tick.ok', 'watchdog.tick.failed'],
  },
  {
    file: 'scripts/bull-board.ts',
    patterns: ['bull_board.started', 'bull_board.shutdown'],
  },
  {
    file: 'src/lib/task/submitter.ts',
    patterns: ['requestId', 'task.submit.created', 'task.submit.enqueued'],
  },
  {
    file: 'src/lib/task/types.ts',
    patterns: ['trace', 'requestId'],
  },
]

function read(file: string) {
  return fs.readFileSync(file, 'utf8')
}

function checkRules() {
  const violations: string[] = []
  for (const rule of RULES) {
    const content = read(rule.file)
    for (const pattern of rule.patterns) {
      if (!content.includes(pattern)) {
        violations.push(`${rule.file} missing "${pattern}"`)
      }
    }
  }
  return violations
}

function checkSubmitTaskRoutes() {
  const root = 'src/app/api'
  const files = walk(root).filter((file) => file.endsWith('/route.ts'))
  const submitTaskFiles = files.filter((file) => read(file).includes('submitTask('))
  const violations: string[] = []

  for (const file of submitTaskFiles) {
    const content = read(file)
    if (!content.includes('getRequestId')) {
      violations.push(`${file} uses submitTask but does not import getRequestId`)
      continue
    }
    if (!content.includes('requestId: getRequestId(request)')) {
      violations.push(`${file} uses submitTask but does not pass requestId`)
    }
  }

  return { submitTaskFiles, violations }
}

function walk(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const out: string[] = []

  for (const entry of entries) {
    const next = `${dir}/${entry.name}`
    if (entry.isDirectory()) {
      out.push(...walk(next))
    } else {
      out.push(next)
    }
  }

  return out
}

function main() {
  const violations = checkRules()
  const submitTaskResult = checkSubmitTaskRoutes()
  violations.push(...submitTaskResult.violations)

  if (violations.length > 0) {
    process.stderr.write('[check:log-semantic] semantic violations detected:\n')
    for (const violation of violations) {
      process.stderr.write(`- ${violation}\n`)
    }
    process.exit(1)
  }

  process.stdout.write(
    `[check:log-semantic] ok rules=${RULES.length} submitTaskRoutes=${submitTaskResult.submitTaskFiles.length}\n`,
  )
}

main()
