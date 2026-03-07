#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import process from 'process'

const root = process.cwd()
const scanRoots = [
  'src/app/[locale]/workspace/[projectId]/modes/novel-promotion',
]
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])

const forbiddenRules = [
  {
    name: 'localProject/localEpisode mirror state',
    test: (line) => /\blocalProject\b|\blocalEpisode\b/.test(line),
  },
  {
    name: 'server mirror useState(projectData.*)',
    test: (line) => /useState\s*\(\s*projectData\./.test(line),
  },
  {
    name: 'server mirror useState(episode?.*)',
    test: (line) => /useState\s*\(\s*episode\?\./.test(line),
  },
]

function fail(title, details = []) {
  console.error(`\n[no-server-mirror-state] ${title}`)
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
    if (sourceExtensions.has(ext)) out.push(fullPath)
  }
  return out
}

function collectViolations(fullPath) {
  const relPath = toRel(fullPath)
  const content = fs.readFileSync(fullPath, 'utf8')
  const lines = content.split('\n')
  const violations = []

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    for (const rule of forbiddenRules) {
      if (rule.test(line)) {
        violations.push(`${relPath}:${i + 1} forbidden: ${rule.name}`)
      }
    }
  }

  return violations
}

const allFiles = scanRoots.flatMap((scanRoot) => walk(path.join(root, scanRoot)))
const violations = allFiles.flatMap((fullPath) => collectViolations(fullPath))

if (violations.length > 0) {
  fail('Found forbidden server mirror state patterns', violations)
}

console.log('[no-server-mirror-state] OK')
