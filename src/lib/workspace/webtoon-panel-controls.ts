export type WebtoonPanelQuickAction = 'add' | 'duplicate' | 'split' | 'merge' | 'reorder'

export interface WebtoonQuickActionMeta {
  id: WebtoonPanelQuickAction
  label: string
  helper: string
}

export interface WebtoonScrollPreviewItem {
  id: string
  panelIndex: number
  relativeHeight: number
  emphasis: 'anchor' | 'support' | 'transition'
}

export const WEBTOON_PANEL_QUICK_ACTIONS: WebtoonQuickActionMeta[] = [
  { id: 'add', label: 'Add', helper: 'Thêm panel mới ở nhịp hiện tại.' },
  { id: 'duplicate', label: 'Duplicate', helper: 'Nhân bản panel để giữ continuity.' },
  { id: 'split', label: 'Split', helper: 'Chia panel dài thành 2 beat rõ hơn.' },
  { id: 'merge', label: 'Merge', helper: 'Gộp panel ngắn để giảm nhiễu nhịp đọc.' },
  { id: 'reorder', label: 'Reorder', helper: 'Đổi thứ tự beat để tối ưu flow dọc.' },
]

function normalize(weights: number[]): number[] {
  const safe = weights.map((n) => (Number.isFinite(n) && n > 0 ? n : 1))
  const total = safe.reduce((sum, n) => sum + n, 0)
  if (total <= 0) return safe.map(() => 1 / safe.length)
  return safe.map((n) => Number((n / total).toFixed(3)))
}

function fallbackWeights(panelSlotCount: number): number[] {
  const count = Math.max(1, Math.min(12, Math.trunc(panelSlotCount) || 1))
  return Array.from({ length: count }, (_, i) => 1 + i * 0.08)
}

export function buildWebtoonScrollNarrativePreview(input: {
  panelSlotCount: number
  layoutFamily?: string
}): WebtoonScrollPreviewItem[] {
  const family = input.layoutFamily || ''

  let weights: number[]
  if (family === 'single-splash') {
    weights = [1]
  } else if (family === 'dual-split' || family === 'dual-hero-support') {
    weights = [0.54, 0.46]
  } else if (family === 'triple-strip' || family === 'triple-focus') {
    weights = [0.28, 0.33, 0.39]
  } else if (family.startsWith('quad-')) {
    weights = [0.2, 0.23, 0.27, 0.3]
  } else if (family === 'dense-six-panel') {
    weights = [0.12, 0.14, 0.16, 0.17, 0.2, 0.21]
  } else if (family.startsWith('cinematic-')) {
    const n = Math.max(4, Math.min(8, Math.trunc(input.panelSlotCount) || 5))
    weights = Array.from({ length: n }, (_, i) => 0.9 + i * 0.07)
  } else {
    weights = fallbackWeights(input.panelSlotCount)
  }

  const normalized = normalize(weights)
  return normalized.map((relativeHeight, index) => {
    const emphasis: WebtoonScrollPreviewItem['emphasis'] = index === 0
      ? 'anchor'
      : index === normalized.length - 1
        ? 'transition'
        : 'support'

    return {
      id: `preview-panel-${index + 1}`,
      panelIndex: index + 1,
      relativeHeight,
      emphasis,
    }
  })
}
