#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import process from 'process'

const root = process.cwd()
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])

const lineScanRoots = [
  'src/app/[locale]/workspace/[projectId]/modes/novel-promotion',
  'src/lib/query/hooks',
]

const fileScanRoots = [
  'src/app/api/novel-promotion',
  'src/lib/workers/handlers',
]

const lineRules = [
  {
    name: 'shadow state localStoryboards',
    test: (line) => /const\s*\[\s*localStoryboards\s*,\s*setLocalStoryboards\s*\]\s*=\s*useState/.test(line),
  },
  {
    name: 'shadow state localVoiceLines',
    test: (line) => /const\s*\[\s*localVoiceLines\s*,\s*setLocalVoiceLines\s*\]\s*=\s*useState/.test(line),
  },
  {
    name: 'hardcoded queryKey array',
    test: (line) => /queryKey\s*:\s*\[/.test(line),
  },
]

function fail(title, details = []) {
  console.error(`\n[no-multiple-sources-of-truth] ${title}`)
  for (const detail of details) {
    console.error(`  - ${detail}`)
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
    if (sourceExtensions.has(path.extname(entry.name))) out.push(fullPath)
  }
  return out
}

function collectLineViolations(fullPath) {
  const relPath = toRel(fullPath)
  const content = fs.readFileSync(fullPath, 'utf8')
  const lines = content.split('\n')
  const violations = []

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    for (const rule of lineRules) {
      if (rule.test(line)) {
        violations.push(`${relPath}:${i + 1} forbidden: ${rule.name}`)
      }
    }
  }

  return violations
}

function collectFileViolations(fullPath) {
  const relPath = toRel(fullPath)
  const content = fs.readFileSync(fullPath, 'utf8')
  const violations = []

  const updateCallRegex = /novelPromotionProject\.update\(\{[\s\S]*?\n\s*\}\)/g
  for (const match of content.matchAll(updateCallRegex)) {
    const block = match[0]
    const hasStageWrite = /\bdata\s*:\s*\{[\s\S]*?\bstage\s*:/.test(block)
    if (!hasStageWrite) continue
    const before = content.slice(0, match.index ?? 0)
    const lineNumber = before.split('\n').length
    violations.push(`${relPath}:${lineNumber} forbidden: DB stage write in novelPromotionProject.update`)
  }

  return violations
}

const lineFiles = lineScanRoots.flatMap((scanRoot) => walk(path.join(root, scanRoot)))
const fileFiles = fileScanRoots.flatMap((scanRoot) => walk(path.join(root, scanRoot)))

const lineViolations = lineFiles.flatMap((fullPath) => collectLineViolations(fullPath))
const fileViolations = fileFiles.flatMap((fullPath) => collectFileViolations(fullPath))
const allViolations = [...lineViolations, ...fileViolations]

if (allViolations.length > 0) {
  fail('Found multiple-sources-of-truth regressions', allViolations)
}

console.log('[no-multiple-sources-of-truth] OK')
