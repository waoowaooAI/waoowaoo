#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import process from 'process'

const root = process.cwd()

const CANARY_FILES = {
  clips: 'standards/prompt-canary/story_to_script_clips.canary.json',
  screenplay: 'standards/prompt-canary/screenplay_conversion.canary.json',
  storyboardPanels: 'standards/prompt-canary/storyboard_panels.canary.json',
  voiceAnalysis: 'standards/prompt-canary/voice_analysis.canary.json',
}

const TEMPLATE_TOKEN_REQUIREMENTS = {
  'novel-promotion/agent_clip': ['start', 'end', 'summary', 'location', 'characters'],
  'novel-promotion/screenplay_conversion': [
    'clip_id',
    'original_text',
    'scenes',
    'heading',
    'content',
    'type',
    'action',
    'dialogue',
    'voiceover',
  ],
  'novel-promotion/agent_storyboard_plan': [
    'panel_number',
    'description',
    'characters',
    'location',
    'scene_type',
    'source_text',
  ],
  'novel-promotion/agent_storyboard_detail': [
    'panel_number',
    'description',
    'characters',
    'location',
    'scene_type',
    'source_text',
    'shot_type',
    'camera_move',
    'video_prompt',
  ],
  'novel-promotion/agent_storyboard_insert': [
    'panel_number',
    'description',
    'characters',
    'location',
    'scene_type',
    'source_text',
    'shot_type',
    'camera_move',
    'video_prompt',
  ],
  'novel-promotion/voice_analysis': [
    'lineIndex',
    'speaker',
    'content',
    'emotionStrength',
    'matchedPanel',
    'storyboardId',
    'panelIndex',
  ],
}

function fail(title, details = []) {
  console.error(`\n[prompt-json-canary-guard] ${title}`)
  for (const line of details) {
    console.error(`  - ${line}`)
  }
  process.exit(1)
}

function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isString(value) {
  return typeof value === 'string'
}

function isNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function readJson(relativePath) {
  const fullPath = path.join(root, relativePath)
  if (!fs.existsSync(fullPath)) {
    fail('Missing canary fixture', [relativePath])
  }
  try {
    return JSON.parse(fs.readFileSync(fullPath, 'utf8'))
  } catch (error) {
    fail('Invalid canary fixture JSON', [`${relativePath}: ${error instanceof Error ? error.message : String(error)}`])
  }
}

function validateClipCanary(value) {
  if (!Array.isArray(value) || value.length === 0) return 'clips fixture must be a non-empty array'
  for (let i = 0; i < value.length; i += 1) {
    const row = value[i]
    if (!isRecord(row)) return `clips[${i}] must be an object`
    if (!isString(row.start) || row.start.length < 5) return `clips[${i}].start must be string length >= 5`
    if (!isString(row.end) || row.end.length < 5) return `clips[${i}].end must be string length >= 5`
    if (!isString(row.summary) || row.summary.length === 0) return `clips[${i}].summary must be non-empty string`
    if (!(row.location === null || isString(row.location))) return `clips[${i}].location must be string or null`
    if (!Array.isArray(row.characters) || !row.characters.every((item) => isString(item))) {
      return `clips[${i}].characters must be string array`
    }
  }
  return null
}

function validateScreenplayCanary(value) {
  if (!isRecord(value)) return 'screenplay fixture must be an object'
  if (!isString(value.clip_id) || !value.clip_id) return 'screenplay.clip_id must be non-empty string'
  if (!isString(value.original_text)) return 'screenplay.original_text must be string'
  if (!Array.isArray(value.scenes) || value.scenes.length === 0) return 'screenplay.scenes must be non-empty array'

  for (let i = 0; i < value.scenes.length; i += 1) {
    const scene = value.scenes[i]
    if (!isRecord(scene)) return `screenplay.scenes[${i}] must be object`
    if (!isNumber(scene.scene_number)) return `screenplay.scenes[${i}].scene_number must be number`
    if (!isRecord(scene.heading)) return `screenplay.scenes[${i}].heading must be object`
    if (!isString(scene.heading.int_ext)) return `screenplay.scenes[${i}].heading.int_ext must be string`
    if (!isString(scene.heading.location)) return `screenplay.scenes[${i}].heading.location must be string`
    if (!isString(scene.heading.time)) return `screenplay.scenes[${i}].heading.time must be string`
    if (!isString(scene.description)) return `screenplay.scenes[${i}].description must be string`
    if (!Array.isArray(scene.characters) || !scene.characters.every((item) => isString(item))) {
      return `screenplay.scenes[${i}].characters must be string array`
    }
    if (!Array.isArray(scene.content) || scene.content.length === 0) return `screenplay.scenes[${i}].content must be non-empty array`

    for (let j = 0; j < scene.content.length; j += 1) {
      const segment = scene.content[j]
      if (!isRecord(segment)) return `screenplay.scenes[${i}].content[${j}] must be object`
      if (!isString(segment.type)) return `screenplay.scenes[${i}].content[${j}].type must be string`
      if (segment.type === 'action') {
        if (!isString(segment.text)) return `screenplay action[${i}:${j}].text must be string`
      } else if (segment.type === 'dialogue') {
        if (!isString(segment.character)) return `screenplay dialogue[${i}:${j}].character must be string`
        if (!isString(segment.lines)) return `screenplay dialogue[${i}:${j}].lines must be string`
        if (segment.parenthetical !== undefined && !isString(segment.parenthetical)) {
          return `screenplay dialogue[${i}:${j}].parenthetical must be string when present`
        }
      } else if (segment.type === 'voiceover') {
        if (!isString(segment.text)) return `screenplay voiceover[${i}:${j}].text must be string`
        if (segment.character !== undefined && !isString(segment.character)) {
          return `screenplay voiceover[${i}:${j}].character must be string when present`
        }
      } else {
        return `screenplay.scenes[${i}].content[${j}].type must be action/dialogue/voiceover`
      }
    }
  }

  return null
}

function validateStoryboardPanelsCanary(value) {
  if (!Array.isArray(value) || value.length === 0) return 'storyboard panels fixture must be non-empty array'
  for (let i = 0; i < value.length; i += 1) {
    const panel = value[i]
    if (!isRecord(panel)) return `storyboardPanels[${i}] must be object`
    if (!isNumber(panel.panel_number)) return `storyboardPanels[${i}].panel_number must be number`
    if (!isString(panel.description)) return `storyboardPanels[${i}].description must be string`
    if (!isString(panel.location)) return `storyboardPanels[${i}].location must be string`
    if (!isString(panel.scene_type)) return `storyboardPanels[${i}].scene_type must be string`
    if (!isString(panel.source_text)) return `storyboardPanels[${i}].source_text must be string`
    if (!isString(panel.shot_type)) return `storyboardPanels[${i}].shot_type must be string`
    if (!isString(panel.camera_move)) return `storyboardPanels[${i}].camera_move must be string`
    if (!isString(panel.video_prompt)) return `storyboardPanels[${i}].video_prompt must be string`
    if (panel.duration !== undefined && !isNumber(panel.duration)) return `storyboardPanels[${i}].duration must be number when present`
    if (!Array.isArray(panel.characters)) return `storyboardPanels[${i}].characters must be array`
    for (let j = 0; j < panel.characters.length; j += 1) {
      const character = panel.characters[j]
      if (!isRecord(character)) return `storyboardPanels[${i}].characters[${j}] must be object`
      if (!isString(character.name)) return `storyboardPanels[${i}].characters[${j}].name must be string`
      if (character.appearance !== undefined && !isString(character.appearance)) {
        return `storyboardPanels[${i}].characters[${j}].appearance must be string when present`
      }
    }
  }
  return null
}

function validateVoiceAnalysisCanary(value) {
  if (!Array.isArray(value) || value.length === 0) return 'voice analysis fixture must be non-empty array'
  for (let i = 0; i < value.length; i += 1) {
    const row = value[i]
    if (!isRecord(row)) return `voiceAnalysis[${i}] must be object`
    if (!isNumber(row.lineIndex)) return `voiceAnalysis[${i}].lineIndex must be number`
    if (!isString(row.speaker)) return `voiceAnalysis[${i}].speaker must be string`
    if (!isString(row.content)) return `voiceAnalysis[${i}].content must be string`
    if (!isNumber(row.emotionStrength)) return `voiceAnalysis[${i}].emotionStrength must be number`
    if (row.matchedPanel !== null) {
      if (!isRecord(row.matchedPanel)) return `voiceAnalysis[${i}].matchedPanel must be object or null`
      if (!isString(row.matchedPanel.storyboardId)) return `voiceAnalysis[${i}].matchedPanel.storyboardId must be string`
      if (!isNumber(row.matchedPanel.panelIndex)) return `voiceAnalysis[${i}].matchedPanel.panelIndex must be number`
    }
  }
  return null
}

function checkTemplateTokens(pathStem, requiredTokens) {
  const violations = []
  for (const locale of ['zh', 'en']) {
    const relPath = `lib/prompts/${pathStem}.${locale}.txt`
    const fullPath = path.join(root, relPath)
    if (!fs.existsSync(fullPath)) {
      violations.push(`missing template: ${relPath}`)
      continue
    }
    const content = fs.readFileSync(fullPath, 'utf8')
    for (const token of requiredTokens) {
      if (!content.includes(token)) {
        violations.push(`missing token ${token} in ${relPath}`)
      }
    }
  }
  return violations
}

const violations = []

const clipsErr = validateClipCanary(readJson(CANARY_FILES.clips))
if (clipsErr) violations.push(clipsErr)

const screenplayErr = validateScreenplayCanary(readJson(CANARY_FILES.screenplay))
if (screenplayErr) violations.push(screenplayErr)

const panelsErr = validateStoryboardPanelsCanary(readJson(CANARY_FILES.storyboardPanels))
if (panelsErr) violations.push(panelsErr)

const voiceErr = validateVoiceAnalysisCanary(readJson(CANARY_FILES.voiceAnalysis))
if (voiceErr) violations.push(voiceErr)

for (const [pathStem, requiredTokens] of Object.entries(TEMPLATE_TOKEN_REQUIREMENTS)) {
  violations.push(...checkTemplateTokens(pathStem, requiredTokens))
}

if (violations.length > 0) {
  fail('JSON schema canary check failed', violations)
}

console.log('[prompt-json-canary-guard] OK')
