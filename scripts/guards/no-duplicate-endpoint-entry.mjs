#!/usr/bin/env node
import fs from 'fs'
import path from 'path'

const ROOT = process.cwd()
const API_ROOT = path.join(ROOT, 'src', 'app', 'api')

const KNOWN_DUPLICATE_GROUPS = [
  {
    key: 'user-llm-test-connection',
    candidates: [
      'src/app/api/user/api-config/test-connection/route.ts',
      'src/app/api/user/test-llm-provider/route.ts',
    ],
  },
]

const exists = (relPath) => fs.existsSync(path.join(ROOT, relPath))

const failures = []
for (const group of KNOWN_DUPLICATE_GROUPS) {
  const present = group.candidates.filter(exists)
  if (present.length > 1) {
    failures.push({ key: group.key, present })
  }
}

if (!fs.existsSync(API_ROOT)) {
  process.stdout.write('[no-duplicate-endpoint-entry] PASS (api dir missing)\n')
  process.exit(0)
}

if (failures.length === 0) {
  process.stdout.write('[no-duplicate-endpoint-entry] PASS\n')
  process.exit(0)
}

process.stderr.write('[no-duplicate-endpoint-entry] FAIL: duplicated endpoint entry detected\n')
for (const failure of failures) {
  process.stderr.write(`- ${failure.key}\n`)
  for (const relPath of failure.present) {
    process.stderr.write(`  - ${relPath}\n`)
  }
}
process.exit(1)
