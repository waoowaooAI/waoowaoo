import { buildDirectorStyleDoc, isDirectorStylePresetId } from './presets'
import type { DirectorStylePresetId } from './ids'
import {
  DIRECTOR_STYLE_BLOCK_FIELD_KEYS,
  DIRECTOR_STYLE_DOC_FIELDS,
  type DirectorStyleDoc,
  type DirectorStyleDocField,
} from './types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function isDirectorStyleBlock(field: DirectorStyleDocField, value: unknown): boolean {
  if (!isRecord(value)) return false
  return DIRECTOR_STYLE_BLOCK_FIELD_KEYS[field].every((key) => typeof value[key] === 'string')
}

function isDirectorStyleDoc(value: unknown): value is DirectorStyleDoc {
  if (!isRecord(value)) return false
  return DIRECTOR_STYLE_DOC_FIELDS.every((field) => isDirectorStyleBlock(field, value[field]))
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
