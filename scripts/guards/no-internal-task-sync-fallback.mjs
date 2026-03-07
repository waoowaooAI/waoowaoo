#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import process from 'process'

const root = process.cwd()
const scanRoots = ['src/app/api', 'src/pages/api']
const allowedPrefixes = ['src/app/api/ui-review/', 'src/pages/api/ui-review/']
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])

function fail(title, details = []) {
  console.error(`\n[no-internal-task-sync-fallback] ${title}`)
  for (const line of details) {
    console.error(`  - ${line}`)
  }
  process.exit(1)
}

function toRel(fullPath) {
  return path.relative(root, fullPath).split(path.sep).join('/')
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === '.next' || entry.name === 'node_modules') continue
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(fullPath, out)
      continue
    }
    if (sourceExtensions.has(path.extname(entry.name))) {
      out.push(fullPath)
    }
  }
  return out
}

function isAllowedFile(relPath) {
  return allowedPrefixes.some((prefix) => relPath.startsWith(prefix))
}

function collectViolations(fullPath) {
  const relPath = toRel(fullPath)
  if (isAllowedFile(relPath)) return []

  const content = fs.readFileSync(fullPath, 'utf8')
  const lines = content.split('\n')
  const violations = []

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (/\bisInternalTaskExecution\b/.test(line)) {
      violations.push(`${relPath}:${i + 1} forbidden dual-track fallback marker isInternalTaskExecution`)
    }
    if (/\bshouldRunSyncTask\s*\(/.test(line)) {
      violations.push(`${relPath}:${i + 1} forbidden sync-mode branch helper shouldRunSyncTask`)
    }
  }

  if (/\bmaybeSubmitLLMTask\s*\(/.test(content) && !/sync mode is disabled for this route/.test(content)) {
    violations.push(`${relPath} missing explicit sync-disabled guard after maybeSubmitLLMTask`)
  }

  return violations
}

const allFiles = scanRoots.flatMap((scanRoot) => walk(path.join(root, scanRoot)))
const violations = allFiles.flatMap((fullPath) => collectViolations(fullPath))

if (violations.length > 0) {
  fail('Found potential sync fallback or dual-track task branch in production API routes', violations)
}

console.log('[no-internal-task-sync-fallback] OK')
