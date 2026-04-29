#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const targetDirs = [
  'src/lib/ai-providers',
  'src/lib/ai-exec',
  'src/lib/ai-registry',
]

const forbidden = [
  {
    label: 'selection.modelId fallback',
    pattern: /\b(?:input\.)?selection\.modelId\s*\|\|/,
  },
  {
    label: 'request.modelId fallback',
    pattern: /\brequest\.modelId\s*\|\|/,
  },
  {
    label: 'option modelId fallback',
    pattern: /\b(?:options|rawOptions)\.modelId\s*\|\|/,
  },
  {
    label: 'optional modelId fallback',
    pattern: /\bmodel\?\.modelId\s*\|\|/,
  },
]

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full, files)
    } else if (entry.isFile() && full.endsWith('.ts')) {
      files.push(full)
    }
  }
  return files
}

const violations = []
for (const targetDir of targetDirs) {
  for (const file of walk(path.join(root, targetDir))) {
    const rel = path.relative(root, file)
    const text = fs.readFileSync(file, 'utf8')
    const lines = text.split(/\r?\n/)
    lines.forEach((line, index) => {
      for (const rule of forbidden) {
        if (rule.pattern.test(line)) {
          violations.push(`${rel}:${index + 1}: ${rule.label}: ${line.trim()}`)
        }
      }
    })
  }
}

if (violations.length > 0) {
  console.error('[no-provider-model-fallback] implicit provider model fallback is forbidden:')
  for (const violation of violations) console.error(`  ${violation}`)
  process.exit(1)
}

console.log(`[no-provider-model-fallback] OK scanned=${targetDirs.join(',')}`)
