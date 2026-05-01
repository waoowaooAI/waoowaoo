import { describe, expect, it } from 'vitest'
import type { CanvasNodeLayout } from '@/lib/project-canvas/layout/canvas-layout.types'
import { resolveCanvasNodeLayouts } from '@/lib/project-canvas/layout/resolve-canvas-layout'

function createLayout(nodeKey: string, x: number, y: number): CanvasNodeLayout {
  return {
    nodeKey,
    x,
    y,
    width: 320,
    height: 220,
    zIndex: 0,
    locked: false,
    collapsed: false,
  }
}

describe('resolve canvas node layouts', () => {
  it('uses saved layout only for nodes that still exist in auto layout', () => {
    const autoLayouts = new Map<string, CanvasNodeLayout>([
      ['panelImage:panel-1', createLayout('panelImage:panel-1', 0, 0)],
      ['panelImage:panel-2', createLayout('panelImage:panel-2', 400, 0)],
    ])

    const resolved = resolveCanvasNodeLayouts({
      autoLayouts,
      savedLayouts: [
        createLayout('panelImage:panel-2', 900, 700),
        createLayout('panelImage:deleted-panel', 999, 999),
      ],
    })

    expect(resolved.get('panelImage:panel-1')?.x).toBe(0)
    expect(resolved.get('panelImage:panel-2')?.x).toBe(900)
    expect(resolved.get('panelImage:panel-2')?.y).toBe(700)
    expect(resolved.has('panelImage:deleted-panel')).toBe(false)
  })
})
