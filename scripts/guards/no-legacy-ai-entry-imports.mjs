#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execSync } from 'node:child_process'

const LEGACY_IMPORT_PATTERNS = [
  {
    label: '@/lib/llm execution entry',
    pattern: /from\s+['"]@\/lib\/llm\/(?:chat-completion|chat-stream|vision)['"]|import\(['"]@\/lib\/llm\/(?:chat-completion|chat-stream|vision)['"]\)/,
  },
  {
    label: '@/lib/generators',
    pattern: /from\s+['"]@\/lib\/generators(?:\/[^'"]*)?['"]|import\(['"]@\/lib\/generators(?:\/[^'"]*)?['"]\)/,
  },
  {
    label: '@/lib/model-gateway',
    pattern: /from\s+['"]@\/lib\/model-gateway(?:\/[^'"]*)?['"]|import\(['"]@\/lib\/model-gateway(?:\/[^'"]*)?['"]\)/,
  },
  {
    label: '@/lib/ai-exec compatibility entry',
    pattern: /from\s+['"]@\/lib\/ai-exec\/(?:media\/generator-api|llm\/(?:chat-completion|chat-stream|vision))['"]|import\(['"]@\/lib\/ai-exec\/(?:media\/generator-api|llm\/(?:chat-completion|chat-stream|vision))['"]\)/,
  },
]

function listTrackedFiles() {
  const output = execSync('git ls-files', {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  return output.split('\n')
    .map((line) => line.trim())
    .filter((file) => /^(src|tests)\/.*\.tsx?$/.test(file))
}

export function inspectLegacyAiEntryImports(files) {
  const violations = []
  for (const file of files) {
    let source = ''
    try {
      source = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    for (const rule of LEGACY_IMPORT_PATTERNS) {
      if (rule.pattern.test(source)) {
        violations.push(`${file}: imports legacy AI entry ${rule.label}; use @/lib/ai-exec/engine or provider adapter paths`)
      }
    }
  }
  return violations
}

function runCli() {
  const files = process.argv.slice(2).length > 0
    ? process.argv.slice(2).map((file) => relative(process.cwd(), file))
    : listTrackedFiles()
  const violations = inspectLegacyAiEntryImports(files)
  if (violations.length > 0) {
    console.error('\n[no-legacy-ai-entry-imports] Legacy AI imports are forbidden')
    for (const violation of violations) console.error(`  - ${violation}`)
    process.exit(1)
  }
  console.log(`[no-legacy-ai-entry-imports] OK files=${files.length}`)
}

const entryHref = process.argv[1] ? pathToFileURL(process.argv[1]).href : null
if (entryHref && import.meta.url === entryHref) runCli()
