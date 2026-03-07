#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import process from 'process'

const root = process.cwd()
const scanRoots = ['src/app/api', 'src/pages/api']
const allowedPrefixes = []
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])

function fail(title, details = []) {
  console.error(`\n[no-api-direct-llm-call] ${title}`)
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
    const ext = path.extname(entry.name)
    if (sourceExtensions.has(ext)) {
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
    if (/from\s+['"]@\/lib\/llm-client['"]/.test(line)) {
      violations.push(`${relPath}:${i + 1} forbidden import from '@/lib/llm-client'`)
    }
    if (/\bchatCompletion[A-Za-z0-9_]*\s*\(/.test(line)) {
      violations.push(`${relPath}:${i + 1} forbidden direct chatCompletion* call`)
    }
    if (/\bisInternalTaskExecution\b/.test(line)) {
      violations.push(`${relPath}:${i + 1} forbidden dual-track fallback marker isInternalTaskExecution`)
    }
  }

  return violations
}

const allFiles = scanRoots.flatMap((scanRoot) => walk(path.join(root, scanRoot)))
const violations = allFiles.flatMap((fullPath) => collectViolations(fullPath))

if (violations.length > 0) {
  fail('Found forbidden direct LLM execution in production API routes', violations)
}

console.log('[no-api-direct-llm-call] OK')
