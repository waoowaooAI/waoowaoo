import { ART_STYLES, getArtStylePrompt } from '@/lib/constants'
import { buildDirectorStyleDoc } from '@/lib/director-style'
import { DIRECTOR_STYLE_PRESET_IDS } from '@/lib/director-style/ids'
import { STYLE_PRESETS } from '@/lib/style-presets'
import type { DirectorStyleDoc } from '@/lib/director-style'
import type { VisualStyleConfig } from './types'

export function isSystemVisualStylePresetId(value: string): boolean {
  return ART_STYLES.some((style) => style.value === value)
}

export function isSystemDirectorStylePresetId(value: string): value is typeof DIRECTOR_STYLE_PRESET_IDS.HORROR_SUSPENSE {
  return value === DIRECTOR_STYLE_PRESET_IDS.HORROR_SUSPENSE
}

export function listSystemVisualStylePresets(locale: 'zh' | 'en') {
  return ART_STYLES.map((style) => ({
    presetSource: 'system' as const,
    presetId: style.value,
    label: style.label,
    description: getArtStylePrompt(style.value, locale),
  }))
}

export function listSystemDirectorStylePresets() {
  return STYLE_PRESETS
    .filter((preset) => preset.value)
    .map((preset) => ({
      presetSource: 'system' as const,
      presetId: preset.value,
      label: preset.label,
      description: preset.description,
    }))
}

export function buildSystemVisualStyleConfig(presetId: string, locale: 'zh' | 'en'): VisualStyleConfig {
  const style = ART_STYLES.find((item) => item.value === presetId)
  if (!style) {
    throw new Error(`VISUAL_STYLE_SYSTEM_PRESET_UNSUPPORTED:${presetId}`)
  }
  return {
    prompt: getArtStylePrompt(presetId, locale),
    negativePrompt: '',
    colorPalette: [],
    lineStyle: '',
    texture: '',
    lighting: '',
    composition: '',
    detailLevel: 'medium',
  }
}

export function buildSystemDirectorStyleConfig(presetId: string): DirectorStyleDoc {
  if (!isSystemDirectorStylePresetId(presetId)) {
    throw new Error(`DIRECTOR_STYLE_SYSTEM_PRESET_UNSUPPORTED:${presetId}`)
  }
  return buildDirectorStyleDoc(presetId)
}
