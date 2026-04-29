import type { StylePresetRef } from './types'

const SEPARATOR = ':'

export function encodeStylePresetRef(ref: StylePresetRef): string {
  return `${ref.presetSource}${SEPARATOR}${ref.presetId}`
}

export function decodeStylePresetRef(value: string): StylePresetRef {
  const separatorIndex = value.indexOf(SEPARATOR)
  if (separatorIndex <= 0) {
    throw new Error(`STYLE_PRESET_REF_INVALID:${value}`)
  }
  const presetSource = value.slice(0, separatorIndex)
  const presetId = value.slice(separatorIndex + 1)
  if ((presetSource !== 'system' && presetSource !== 'user') || !presetId) {
    throw new Error(`STYLE_PRESET_REF_INVALID:${value}`)
  }
  return { presetSource, presetId }
}
