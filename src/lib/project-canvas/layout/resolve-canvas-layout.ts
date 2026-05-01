import type { CanvasNodeLayout } from '@/lib/project-canvas/layout/canvas-layout.types'

export function resolveCanvasNodeLayouts(params: {
  readonly autoLayouts: ReadonlyMap<string, CanvasNodeLayout>
  readonly savedLayouts: readonly CanvasNodeLayout[]
}): Map<string, CanvasNodeLayout> {
  const resolved = new Map<string, CanvasNodeLayout>()

  for (const [nodeKey, autoLayout] of params.autoLayouts.entries()) {
    resolved.set(nodeKey, autoLayout)
  }

  for (const savedLayout of params.savedLayouts) {
    if (!params.autoLayouts.has(savedLayout.nodeKey)) continue
    resolved.set(savedLayout.nodeKey, savedLayout)
  }

  return resolved
}
