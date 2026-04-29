import type { VisualStyleConfig } from './types'

export function buildPromptOnlyVisualStyleConfig(prompt: string): VisualStyleConfig {
  return {
    prompt,
    negativePrompt: '',
    colorPalette: [],
    lineStyle: '',
    texture: '',
    lighting: '',
    composition: '',
    detailLevel: 'medium',
  }
}

export function normalizePromptOnlyVisualStyleConfig(config: VisualStyleConfig): VisualStyleConfig {
  return buildPromptOnlyVisualStyleConfig(config.prompt)
}
