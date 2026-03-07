#!/usr/bin/env node

import fs from 'fs'
import path from 'path'

const root = process.cwd()
const targetDirs = [
  path.join(root, 'tests', 'integration', 'api', 'contract'),
  path.join(root, 'tests', 'integration', 'chain'),
]

function fail(title, details = []) {
  console.error(`\n[test-behavior-quality-guard] ${title}`)
  for (const detail of details) {
    console.error(`  - ${detail}`)
  }
  process.exit(1)
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full, out)
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.test.ts')) out.push(full)
  }
  return out
}

function toRel(fullPath) {
  return path.relative(root, fullPath).split(path.sep).join('/')
}

const files = targetDirs.flatMap((dir) => walk(dir))
if (files.length === 0) {
  fail('No target test files found', targetDirs.map((dir) => toRel(dir)))
}

const violations = []

for (const file of files) {
  const rel = toRel(file)
  const text = fs.readFileSync(file, 'utf8')

  const hasSourceRead = /(readFileSync|fs\.readFileSync)\s*\([\s\S]{0,240}src\/(app|lib)\//m.test(text)
  if (hasSourceRead) {
    violations.push(`${rel}: reading source code text is forbidden in behavior contract/chain tests`)
  }

  const forbiddenStringContracts = [
    /toContain\(\s*['"]apiHandler['"]\s*\)/,
    /toContain\(\s*['"]submitTask['"]\s*\)/,
    /toContain\(\s*['"]maybeSubmitLLMTask['"]\s*\)/,
    /includes\(\s*['"]apiHandler['"]\s*\)/,
    /includes\(\s*['"]submitTask['"]\s*\)/,
    /includes\(\s*['"]maybeSubmitLLMTask['"]\s*\)/,
  ]

  for (const pattern of forbiddenStringContracts) {
    if (pattern.test(text)) {
      violations.push(`${rel}: forbidden structural string assertion matched ${pattern}`)
      break
    }
  }

  const hasWeakCallAssertion = /toHaveBeenCalled\(\s*\)/.test(text)
  const hasStrongCallAssertion = /toHaveBeenCalledWith\(/.test(text)
  if (hasWeakCallAssertion && !hasStrongCallAssertion) {
    violations.push(`${rel}: has toHaveBeenCalled() without any toHaveBeenCalledWith() result assertions`)
  }
}

if (violations.length > 0) {
  fail('Behavior quality violations found', violations)
}

console.log(`[test-behavior-quality-guard] OK files=${files.length}`)
