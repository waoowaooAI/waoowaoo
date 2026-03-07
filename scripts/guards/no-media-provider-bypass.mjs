#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import process from 'process'

const root = process.cwd()
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])
const allowFactoryImportIn = new Set([
  'src/lib/generator-api.ts',
  'src/lib/generators/factory.ts',
])

function fail(title, details = []) {
  console.error(`\n[no-media-provider-bypass] ${title}`)
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

const generatorApiPath = path.join(root, 'src/lib/generator-api.ts')
if (!fs.existsSync(generatorApiPath)) {
  fail('Missing src/lib/generator-api.ts')
}

const generatorApiContent = fs.readFileSync(generatorApiPath, 'utf8')
const resolveModelSelectionHits = (generatorApiContent.match(/resolveModelSelection\s*\(/g) || []).length
if (resolveModelSelectionHits < 2) {
  fail('generator-api must route both image and video generation through resolveModelSelection', [
    'expected >= 2 resolveModelSelection(...) calls in src/lib/generator-api.ts',
  ])
}

const allFiles = walk(path.join(root, 'src'))
const violations = []

for (const fullPath of allFiles) {
  const relPath = toRel(fullPath)
  const content = fs.readFileSync(fullPath, 'utf8')
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]

    if (
      relPath !== 'src/lib/generators/factory.ts' &&
      (/\bcreateImageGeneratorByModel\s*\(/.test(line) || /\bcreateVideoGeneratorByModel\s*\(/.test(line))
    ) {
      violations.push(`${relPath}:${i + 1} forbidden provider-bypass factory call create*GeneratorByModel(...)`)
    }

    if ((/\bgetImageApiKey\s*\(/.test(line) || /\bgetVideoApiKey\s*\(/.test(line)) && relPath !== 'src/lib/api-config.ts') {
      violations.push(`${relPath}:${i + 1} forbidden direct getImageApiKey/getVideoApiKey usage outside api-config`)
    }

    if (/from\s+['"]@\/lib\/generators\/factory['"]/.test(line) && !allowFactoryImportIn.has(relPath)) {
      violations.push(`${relPath}:${i + 1} forbidden direct import from '@/lib/generators/factory' (must go through generator-api)`)
    }
  }
}

if (violations.length > 0) {
  fail('Found media provider routing bypass', violations)
}

console.log('[no-media-provider-bypass] OK')
