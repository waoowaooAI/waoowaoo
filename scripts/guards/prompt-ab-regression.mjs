#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import process from 'process'

const root = process.cwd()
const catalogPath = path.join(root, 'src', 'lib', 'prompt-i18n', 'catalog.ts')
const singlePlaceholderPattern = /\{([A-Za-z0-9_]+)\}/g
const doublePlaceholderPattern = /\{\{([A-Za-z0-9_]+)\}\}/g
const unresolvedPlaceholderPattern = /\{\{?[A-Za-z0-9_]+\}?\}/g

function fail(title, details = []) {
  console.error(`\n[prompt-ab-regression] ${title}`)
  for (const line of details) {
    console.error(`  - ${line}`)
  }
  process.exit(1)
}

function parseCatalog(text) {
  const entries = []
  const entryPattern = /pathStem:\s*'([^']+)'\s*,[\s\S]*?variableKeys:\s*\[([\s\S]*?)\]\s*,/g
  for (const match of text.matchAll(entryPattern)) {
    const pathStem = match[1]
    const rawKeys = match[2] || ''
    const keys = Array.from(rawKeys.matchAll(/'([^']+)'/g)).map((item) => item[1])
    entries.push({ pathStem, variableKeys: keys })
  }
  return entries
}

function extractPlaceholders(template) {
  const keys = new Set()
  for (const match of template.matchAll(singlePlaceholderPattern)) {
    if (match[1]) keys.add(match[1])
  }
  for (const match of template.matchAll(doublePlaceholderPattern)) {
    if (match[1]) keys.add(match[1])
  }
  return Array.from(keys)
}

function replaceAll(template, variables) {
  let rendered = template
  for (const [key, value] of Object.entries(variables)) {
    const pattern = new RegExp(`\\{\\{${key}\\}\\}|\\{${key}\\}`, 'g')
    rendered = rendered.replace(pattern, value)
  }
  return rendered
}

function setDiff(left, right) {
  const rightSet = new Set(right)
  return left.filter((item) => !rightSet.has(item))
}

if (!fs.existsSync(catalogPath)) {
  fail('catalog.ts not found', ['src/lib/prompt-i18n/catalog.ts'])
}

const catalogText = fs.readFileSync(catalogPath, 'utf8')
const entries = parseCatalog(catalogText)
if (entries.length === 0) {
  fail('failed to parse prompt catalog entries')
}

const violations = []

for (const entry of entries) {
  const zhPath = path.join(root, 'lib', 'prompts', `${entry.pathStem}.zh.txt`)
  const enPath = path.join(root, 'lib', 'prompts', `${entry.pathStem}.en.txt`)
  if (!fs.existsSync(zhPath)) {
    violations.push(`missing zh template: lib/prompts/${entry.pathStem}.zh.txt`)
    continue
  }
  if (!fs.existsSync(enPath)) {
    violations.push(`missing en template: lib/prompts/${entry.pathStem}.en.txt`)
    continue
  }

  const zhTemplate = fs.readFileSync(zhPath, 'utf8')
  const enTemplate = fs.readFileSync(enPath, 'utf8')
  const declared = entry.variableKeys
  const zhPlaceholders = extractPlaceholders(zhTemplate)
  const enPlaceholders = extractPlaceholders(enTemplate)

  const missingInZh = setDiff(declared, zhPlaceholders)
  const missingInEn = setDiff(declared, enPlaceholders)
  const extraInZh = setDiff(zhPlaceholders, declared)
  const extraInEn = setDiff(enPlaceholders, declared)
  const zhOnly = setDiff(zhPlaceholders, enPlaceholders)
  const enOnly = setDiff(enPlaceholders, zhPlaceholders)

  for (const key of missingInZh) {
    violations.push(`missing {${key}} in zh template: lib/prompts/${entry.pathStem}.zh.txt`)
  }
  for (const key of missingInEn) {
    violations.push(`missing {${key}} in en template: lib/prompts/${entry.pathStem}.en.txt`)
  }
  for (const key of extraInZh) {
    violations.push(`unexpected {${key}} in zh template: lib/prompts/${entry.pathStem}.zh.txt`)
  }
  for (const key of extraInEn) {
    violations.push(`unexpected {${key}} in en template: lib/prompts/${entry.pathStem}.en.txt`)
  }
  for (const key of zhOnly) {
    violations.push(`placeholder {${key}} exists only in zh template: ${entry.pathStem}`)
  }
  for (const key of enOnly) {
    violations.push(`placeholder {${key}} exists only in en template: ${entry.pathStem}`)
  }

  const variables = Object.fromEntries(
    declared.map((key) => [key, `__AB_SAMPLE_${key.toUpperCase()}__`]),
  )
  const renderedZh = replaceAll(zhTemplate, variables)
  const renderedEn = replaceAll(enTemplate, variables)

  const unresolvedZh = renderedZh.match(unresolvedPlaceholderPattern) || []
  const unresolvedEn = renderedEn.match(unresolvedPlaceholderPattern) || []
  if (unresolvedZh.length > 0) {
    violations.push(`unresolved placeholders in zh template: ${entry.pathStem} -> ${unresolvedZh.join(', ')}`)
  }
  if (unresolvedEn.length > 0) {
    violations.push(`unresolved placeholders in en template: ${entry.pathStem} -> ${unresolvedEn.join(', ')}`)
  }

  for (const [key, sample] of Object.entries(variables)) {
    if (!renderedZh.includes(sample)) {
      violations.push(`zh template variable not used after render: ${entry.pathStem}.{${key}}`)
    }
    if (!renderedEn.includes(sample)) {
      violations.push(`en template variable not used after render: ${entry.pathStem}.{${key}}`)
    }
  }
}

if (violations.length > 0) {
  fail('A/B regression check failed', violations)
}

console.log(`[prompt-ab-regression] OK (${entries.length} templates checked)`)
