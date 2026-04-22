import { buildDirectorStyleDoc, isDirectorStylePresetId } from './presets'
import type { DirectorStylePresetId } from './ids'
import type { DirectorStyleDoc, DirectorStyleGuidanceBlock } from './types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isDirectorStyleGuidanceBlock(value: unknown): value is DirectorStyleGuidanceBlock {
  return isRecord(value)
    && typeof value.intent === 'string'
    && isStringArray(value.priorities)
    && isStringArray(value.avoid)
    && isStringArray(value.allowWhenHelpful)
    && typeof value.judgement === 'string'
}

function isDirectorStyleDoc(value: unknown): value is DirectorStyleDoc {
  if (!isRecord(value)) return false
  return (
    isDirectorStyleGuidanceBlock(value.character)
    && isDirectorStyleGuidanceBlock(value.location)
    && isDirectorStyleGuidanceBlock(value.prop)
    && isDirectorStyleGuidanceBlock(value.storyboardPlan)
    && isDirectorStyleGuidanceBlock(value.cinematography)
    && isDirectorStyleGuidanceBlock(value.acting)
    && isDirectorStyleGuidanceBlock(value.storyboardDetail)
    && isDirectorStyleGuidanceBlock(value.image)
    && isDirectorStyleGuidanceBlock(value.video)
  )
}

export function normalizeDirectorStylePresetId(value: unknown): DirectorStylePresetId | null {
  const normalized = normalizeString(value)
  if (!normalized) return null
  if (!isDirectorStylePresetId(normalized)) {
    throw new Error('DIRECTOR_STYLE_PRESET_INVALID')
  }
  return normalized
}

export function resolveDirectorStyleFieldsFromPreset(value: unknown): {
  directorStylePresetId: DirectorStylePresetId | null
  directorStyleDoc: string | null
} {
  const directorStylePresetId = normalizeDirectorStylePresetId(value)
  if (!directorStylePresetId) {
    return {
      directorStylePresetId: null,
      directorStyleDoc: null,
    }
  }

  return {
    directorStylePresetId,
    directorStyleDoc: JSON.stringify(buildDirectorStyleDoc(directorStylePresetId)),
  }
}

export function parseDirectorStyleDoc(raw: unknown): DirectorStyleDoc | null {
  if (!raw) return null

  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown
      return isDirectorStyleDoc(parsed) ? parsed : null
    } catch {
      return null
    }
  }

  return isDirectorStyleDoc(raw) ? raw : null
}
