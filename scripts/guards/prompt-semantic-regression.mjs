#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import process from 'process'

const root = process.cwd()
const chineseCharPattern = /[\p{Script=Han}]/u
const singlePlaceholderPattern = /\{([A-Za-z0-9_]+)\}/g
const doublePlaceholderPattern = /\{\{([A-Za-z0-9_]+)\}\}/g

const criticalTemplateTokens = new Map([
  ['project-workflow/voice_analysis', ['"lineIndex"', '"speaker"', '"content"', '"emotionStrength"', '"matchedPanel"']],
  ['project-workflow/agent_storyboard_plan', ['"panel_number"', '"description"', '"characters"', '"location"', '"scene_type"', '"source_text"', '"shot_type"', '"camera_move"', '"video_prompt"']],
  ['project-workflow/agent_storyboard_detail', ['"panel_number"', '"description"', '"characters"', '"location"', '"scene_type"', '"source_text"', '"shot_type"', '"camera_move"', '"video_prompt"']],
  ['project-workflow/agent_storyboard_insert', ['"panel_number"', '"description"', '"characters"', '"location"', '"scene_type"', '"source_text"', '"shot_type"', '"camera_move"', '"video_prompt"']],
  ['project-workflow/screenplay_conversion', ['"clip_id"', '"scenes"', '"heading"', '"content"', '"dialogue"', '"voiceover"']],
  ['project-workflow/select_location', ['"locations"', '"name"', '"summary"', '"descriptions"']],
  ['project-workflow/episode_split', ['"analysis"', '"episodes"', '"startMarker"', '"endMarker"', '"validation"']],
  ['project-workflow/image_prompt_modify', ['"image_prompt"', '"video_prompt"']],
  ['project-workflow/character_create', ['"prompt"']],
  ['project-workflow/location_create', ['"prompt"']],
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
  const promptIds = parsePromptIds()
  const entryPattern = /\[AI_PROMPT_IDS\.([A-Z0-9_]+)\]:\s*\{([\s\S]*?)\n  \},/g
  for (const match of text.matchAll(entryPattern)) {
    const promptId = promptIds.get(match[1])
    const body = match[2] || ''
    const pathStem = body.match(/pathStem:\s*'([^']+)'/)?.[1]
    const rawKeys = body.match(/variableKeys:\s*\[([\s\S]*?)\]/)?.[1] || ''
    const keys = Array.from(rawKeys.matchAll(/'([^']+)'/g)).map((item) => item[1])
    if (promptId && pathStem) entries.push({ promptId, pathStem, variableKeys: keys })
  }
  return entries
}

function parsePromptIds() {
  const idsPath = path.join(root, 'src', 'lib', 'ai-prompts', 'ids.ts')
  if (!fs.existsSync(idsPath)) {
    fail('ids.ts not found', ['src/lib/ai-prompts/ids.ts'])
  }
  const idsText = fs.readFileSync(idsPath, 'utf8')
  return new Map(
    Array.from(idsText.matchAll(/\b([A-Z0-9_]+):\s*'([^']+)'/g))
      .map((match) => [match[1], match[2]]),
  )
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

const registryPath = path.join(root, 'src', 'lib', 'ai-prompts', 'registry.ts')
if (!fs.existsSync(registryPath)) {
  fail('registry.ts not found', ['src/lib/ai-prompts/registry.ts'])
}

const catalogText = fs.readFileSync(registryPath, 'utf8')
const entries = parseCatalog(catalogText)
if (entries.length === 0) {
  fail('failed to parse AI prompt catalog entries')
}

const violations = []
for (const entry of entries) {
  const templatePath = path.join(root, 'src', 'lib', 'ai-prompts', 'templates', entry.pathStem, `${entry.promptId}.en.txt`)
  const relTemplatePath = `src/lib/ai-prompts/templates/${entry.pathStem}/${entry.promptId}.en.txt`
  if (!fs.existsSync(templatePath)) {
    violations.push(`missing template: ${relTemplatePath}`)
    continue
  }

  const template = fs.readFileSync(templatePath, 'utf8')
  if (chineseCharPattern.test(template)) {
    violations.push(`unexpected Chinese content in English template: ${relTemplatePath}`)
  }

  const placeholders = extractPlaceholders(template)
  const placeholderSet = new Set(placeholders)
  const variableKeySet = new Set(entry.variableKeys)

  for (const key of entry.variableKeys) {
    if (!placeholderSet.has(key)) {
      violations.push(`missing placeholder {${key}} in ${relTemplatePath}`)
    }
  }

  for (const key of placeholders) {
    if (!variableKeySet.has(key)) {
      violations.push(`unexpected placeholder {${key}} in ${relTemplatePath}`)
    }
  }

  const requiredTokens = criticalTemplateTokens.get(entry.pathStem) || []
  for (const token of requiredTokens) {
    if (!template.includes(token)) {
      violations.push(`missing semantic token ${token} in ${relTemplatePath}`)
    }
  }
}

if (violations.length > 0) {
  fail('semantic regression check failed', violations)
}

console.log(`[prompt-semantic-regression] OK (${entries.length} templates checked)`)
