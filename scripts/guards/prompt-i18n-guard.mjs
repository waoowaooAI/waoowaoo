#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import process from 'process'

const root = process.cwd()
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])
const scanRoots = ['src', 'scripts']
const allowedPromptTemplateReaders = new Set([
  'src/lib/ai-prompts/template-store.ts',
  'scripts/guards/prompt-i18n-guard.mjs',
  'scripts/guards/prompt-semantic-regression.mjs',
  'scripts/guards/prompt-ab-regression.mjs',
  'scripts/guards/prompt-json-canary-guard.mjs',
])
const languageDirectiveAllowList = new Set([
  'scripts/guards/prompt-i18n-guard.mjs',
])
const languageDirectivePattern = /请用中文|中文输出|use Chinese|output in Chinese/i

function fail(title, details = []) {
  console.error(`\n[prompt-i18n-guard] ${title}`)
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
    out.push(fullPath)
  }
  return out
}

function listSourceFiles() {
  return scanRoots
    .flatMap((scanRoot) => walk(path.join(root, scanRoot)))
    .filter((fullPath) => sourceExtensions.has(path.extname(fullPath)))
}

function collectDirectPromptReadViolations() {
  const violations = []
  const files = listSourceFiles()
  for (const filePath of files) {
    const relPath = toRel(filePath)
    if (allowedPromptTemplateReaders.has(relPath)) continue
    const content = fs.readFileSync(filePath, 'utf8')
    const hasReadFileSync = /\breadFileSync\s*\(/.test(content)
    if (!hasReadFileSync) continue
    const hasPromptPathToken =
      content.includes('lib/prompts')
      || content.includes('ai-prompts/templates')
      || (
        /['"]ai-prompts['"]/.test(content)
        && /['"]templates['"]/.test(content)
      )
    if (hasPromptPathToken) {
      violations.push(`${relPath} direct prompt file read is forbidden; use buildPrompt/getPromptTemplate`)
    }
  }
  return violations
}

function collectLanguageDirectiveViolations() {
  const violations = []

  for (const filePath of listSourceFiles()) {
    const relPath = toRel(filePath)
    if (languageDirectiveAllowList.has(relPath)) continue
    const lines = fs.readFileSync(filePath, 'utf8').split('\n')
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]
      if (languageDirectivePattern.test(line)) {
        violations.push(`${relPath}:${index + 1} hardcoded language directive is forbidden`)
      }
    }
  }

  const promptFiles = walk(path.join(root, 'src', 'lib', 'ai-prompts', 'templates'))
    .filter((fullPath) => fullPath.endsWith('.en.txt'))
  for (const filePath of promptFiles) {
    const relPath = toRel(filePath)
    const lines = fs.readFileSync(filePath, 'utf8').split('\n')
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]
      if (languageDirectivePattern.test(line)) {
        violations.push(`${relPath}:${index + 1} English template cannot require Chinese output`)
      }
    }
  }

  return violations
}

function collectLegacyPromptFiles() {
  return walk(path.join(root, 'src', 'lib', 'ai-prompts', 'templates'))
    .map((fullPath) => toRel(fullPath))
    .filter((relPath) => relPath.endsWith('.txt') && !relPath.endsWith('.zh.txt') && !relPath.endsWith('.en.txt'))
}

function parsePromptIds() {
  const idsPath = path.join(root, 'src', 'lib', 'ai-prompts', 'ids.ts')
  if (!fs.existsSync(idsPath)) {
    fail('Missing prompt ids file', ['src/lib/ai-prompts/ids.ts'])
  }
  const idsText = fs.readFileSync(idsPath, 'utf8')
  return new Map(
    Array.from(idsText.matchAll(/\b([A-Z0-9_]+):\s*'([^']+)'/g))
      .map((match) => [match[1], match[2]]),
  )
}

function parseAiPromptRegistry() {
  const registryPath = path.join(root, 'src', 'lib', 'ai-prompts', 'registry.ts')
  if (!fs.existsSync(registryPath)) {
    fail('Missing AI prompt registry file', ['src/lib/ai-prompts/registry.ts'])
  }

  const promptIds = parsePromptIds()
  const registryText = fs.readFileSync(registryPath, 'utf8')
  const entries = []
  const entryPattern = /\[AI_PROMPT_IDS\.([A-Z0-9_]+)\]:\s*\{([\s\S]*?)\n  \},/g

  for (const match of registryText.matchAll(entryPattern)) {
    const idKey = match[1]
    const body = match[2] || ''
    const promptId = promptIds.get(idKey)
    const pathStem = body.match(/pathStem:\s*'([^']+)'/)?.[1]
    if (promptId && pathStem) entries.push({ promptId, pathStem })
  }

  if (entries.length === 0) {
    fail('No prompt entries found in AI_PROMPT_CATALOG')
  }

  return entries
}

function verifyPromptCatalogCoverage() {
  const missing = []
  for (const entry of parseAiPromptRegistry()) {
    const zhPath = path.join(root, 'src', 'lib', 'ai-prompts', 'templates', entry.pathStem, `${entry.promptId}.zh.txt`)
    const enPath = path.join(root, 'src', 'lib', 'ai-prompts', 'templates', entry.pathStem, `${entry.promptId}.en.txt`)
    if (!fs.existsSync(zhPath)) {
      missing.push(`missing zh template: src/lib/ai-prompts/templates/${entry.pathStem}/${entry.promptId}.zh.txt`)
    }
    if (!fs.existsSync(enPath)) {
      missing.push(`missing en template: src/lib/ai-prompts/templates/${entry.pathStem}/${entry.promptId}.en.txt`)
    }
  }

  if (missing.length > 0) {
    fail('Prompt template coverage check failed', missing)
  }
}

const legacyPromptFiles = collectLegacyPromptFiles()
if (legacyPromptFiles.length > 0) {
  fail('Legacy prompt files found (.txt without locale suffix)', legacyPromptFiles)
}

verifyPromptCatalogCoverage()

const promptReadViolations = collectDirectPromptReadViolations()
if (promptReadViolations.length > 0) {
  fail('Found direct prompt template reads', promptReadViolations)
}

const languageViolations = collectLanguageDirectiveViolations()
if (languageViolations.length > 0) {
  fail('Found hardcoded language directives', languageViolations)
}

console.log('[prompt-i18n-guard] OK')
