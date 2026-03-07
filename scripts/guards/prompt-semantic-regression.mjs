#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import process from 'process'

const root = process.cwd()
const catalogPath = path.join(root, 'src', 'lib', 'prompt-i18n', 'catalog.ts')
const chineseCharPattern = /[\p{Script=Han}]/u
const singlePlaceholderPattern = /\{([A-Za-z0-9_]+)\}/g
const doublePlaceholderPattern = /\{\{([A-Za-z0-9_]+)\}\}/g

const criticalTemplateTokens = new Map([
  ['novel-promotion/voice_analysis', ['"lineIndex"', '"speaker"', '"content"', '"emotionStrength"', '"matchedPanel"']],
  ['novel-promotion/agent_storyboard_plan', ['"panel_number"', '"description"', '"characters"', '"location"', '"scene_type"', '"source_text"', '"shot_type"', '"camera_move"', '"video_prompt"']],
  ['novel-promotion/agent_storyboard_detail', ['"panel_number"', '"description"', '"characters"', '"location"', '"scene_type"', '"source_text"', '"shot_type"', '"camera_move"', '"video_prompt"']],
  ['novel-promotion/agent_storyboard_insert', ['"panel_number"', '"description"', '"characters"', '"location"', '"scene_type"', '"source_text"', '"shot_type"', '"camera_move"', '"video_prompt"']],
  ['novel-promotion/screenplay_conversion', ['"clip_id"', '"scenes"', '"heading"', '"content"', '"dialogue"', '"voiceover"']],
  ['novel-promotion/select_location', ['"locations"', '"name"', '"summary"', '"descriptions"']],
  ['novel-promotion/episode_split', ['"analysis"', '"episodes"', '"startMarker"', '"endMarker"', '"validation"']],
  ['novel-promotion/image_prompt_modify', ['"image_prompt"', '"video_prompt"']],
  ['novel-promotion/character_create', ['"prompt"']],
  ['novel-promotion/location_create', ['"prompt"']],
])

function fail(title, details = []) {
  console.error(`\n[prompt-semantic-regression] ${title}`)
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
  const templatePath = path.join(root, 'lib', 'prompts', `${entry.pathStem}.en.txt`)
  if (!fs.existsSync(templatePath)) {
    violations.push(`missing template: lib/prompts/${entry.pathStem}.en.txt`)
    continue
  }

  const template = fs.readFileSync(templatePath, 'utf8')
  if (chineseCharPattern.test(template)) {
    violations.push(`unexpected Chinese content in English template: lib/prompts/${entry.pathStem}.en.txt`)
  }

  const placeholders = extractPlaceholders(template)
  const placeholderSet = new Set(placeholders)
  const variableKeySet = new Set(entry.variableKeys)

  for (const key of entry.variableKeys) {
    if (!placeholderSet.has(key)) {
      violations.push(`missing placeholder {${key}} in lib/prompts/${entry.pathStem}.en.txt`)
    }
  }

  for (const key of placeholders) {
    if (!variableKeySet.has(key)) {
      violations.push(`unexpected placeholder {${key}} in lib/prompts/${entry.pathStem}.en.txt`)
    }
  }

  const requiredTokens = criticalTemplateTokens.get(entry.pathStem) || []
  for (const token of requiredTokens) {
    if (!template.includes(token)) {
      violations.push(`missing semantic token ${token} in lib/prompts/${entry.pathStem}.en.txt`)
    }
  }
}

if (violations.length > 0) {
  fail('semantic regression check failed', violations)
}

console.log(`[prompt-semantic-regression] OK (${entries.length} templates checked)`)
