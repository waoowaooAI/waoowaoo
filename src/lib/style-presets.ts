export interface StylePresetOption {
  value: string
  label: string
  description: string
  enabled: boolean
}

const ALL_STYLE_PRESETS: readonly StylePresetOption[] = [
  {
    value: '',
    label: '无',
    description: '不启用',
    enabled: true,
  },
  {
    value: 'horror-suspense',
    label: '恐怖悬疑',
    description: '压迫氛围',
    enabled: true,
  },
]

export const STYLE_PRESETS: readonly StylePresetOption[] = ALL_STYLE_PRESETS.filter(
  (preset) => preset.enabled,
)

export const DEFAULT_STYLE_PRESET_VALUE = ''

export function getStylePresetOption(value: string): StylePresetOption | null {
  if (!value) return null
  return STYLE_PRESETS.find((preset) => preset.value === value) ?? null
}
