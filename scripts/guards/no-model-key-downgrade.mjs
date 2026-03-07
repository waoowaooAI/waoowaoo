#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import process from 'process'

const root = process.cwd()
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])
const scanRoots = ['src/app', 'src/lib']
const modelFields = [
  'analysisModel',
  'characterModel',
  'locationModel',
  'storyboardModel',
  'editModel',
  'videoModel',
]

function fail(title, details = []) {
  console.error(`\n[no-model-key-downgrade] ${title}`)
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

function collectViolations(filePath) {
  const relPath = toRel(filePath)
  const lines = fs.readFileSync(filePath, 'utf8').split('\n')
  const violations = []

  const modelFieldPattern = new RegExp(`\\b(${modelFields.join('|')})\\s*:\\s*[^,\\n]*\\bmodelId\\b`)
  const optionModelIdPattern = /value=\{model\.modelId\}/

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (modelFieldPattern.test(line)) {
      violations.push(`${relPath}:${index + 1} default model field must persist model_key, not modelId`)
    }
    if (optionModelIdPattern.test(line)) {
      violations.push(`${relPath}:${index + 1} UI option value must use modelKey, not model.modelId`)
    }
  }

  return violations
}

function assertFileContains(relativePath, requiredSnippets) {
  const fullPath = path.join(root, relativePath)
  if (!fs.existsSync(fullPath)) {
    fail('Missing required contract file', [relativePath])
  }
  const content = fs.readFileSync(fullPath, 'utf8')
  const missing = requiredSnippets.filter((snippet) => !content.includes(snippet))
  if (missing.length > 0) {
    fail('Model key contract anchor missing', missing.map((snippet) => `${relativePath} missing: ${snippet}`))
  }
}

const files = scanRoots.flatMap((scanRoot) => walk(path.join(root, scanRoot)))
const violations = files.flatMap((filePath) => collectViolations(filePath))

assertFileContains('src/lib/model-config-contract.ts', ['parseModelKeyStrict', 'markerIndex === -1) return null'])
assertFileContains('src/lib/config-service.ts', ['parseModelKeyStrict'])
assertFileContains('src/app/api/user/api-config/route.ts', ['validateDefaultModelKey', 'must be provider::modelId'])
assertFileContains('src/app/api/novel-promotion/[projectId]/route.ts', ['must be provider::modelId'])

if (violations.length > 0) {
  fail('Found model key downgrade pattern', violations)
}

console.log('[no-model-key-downgrade] OK')
