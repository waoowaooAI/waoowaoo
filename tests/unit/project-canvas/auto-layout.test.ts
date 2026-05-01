import { describe, expect, it } from 'vitest'
import type { ProjectCanvasGraph } from '@/lib/project-canvas/graph/canvas-graph.types'
import { buildRuleGridCanvasLayout } from '@/lib/project-canvas/layout/rule-grid-layout-engine'

function createGraph(): ProjectCanvasGraph {
  return {
    nodes: [
      {
        id: 'panelImage:panel-b',
        type: 'panelImage',
        data: {
          nodeKey: 'panelImage:panel-b',
          nodeType: 'panelImage',
          targetId: 'panel-b',
          targetType: 'panel',
          title: 'Panel 2',
          status: 'ready',
        },
      },
      {
        id: 'story:project-1',
        type: 'story',
        data: {
          nodeKey: 'story:project-1',
          nodeType: 'story',
          targetId: 'project-1',
          targetType: 'project',
          title: 'Story',
          status: 'ready',
        },
      },
      {
        id: 'panelImage:panel-a',
        type: 'panelImage',
        data: {
          nodeKey: 'panelImage:panel-a',
          nodeType: 'panelImage',
          targetId: 'panel-a',
          targetType: 'panel',
          title: 'Panel 1',
          status: 'ready',
        },
      },
    ],
    edges: [],
  }
}

describe('rule grid canvas layout', () => {
  it('places nodes deterministically by type lane and stable node id order', () => {
    const layouts = buildRuleGridCanvasLayout(createGraph(), {
      columnsPerRow: 2,
      nodeWidth: 100,
      nodeHeight: 80,
      columnGap: 20,
      rowGap: 30,
      laneGap: 50,
      originX: 10,
      originY: 20,
    })

    expect(layouts.get('story:project-1')).toMatchObject({
      x: 10,
      y: 20,
      width: 100,
      height: 80,
      zIndex: 0,
    })
    expect(layouts.get('panelImage:panel-a')).toMatchObject({
      x: 460,
      y: 20,
      zIndex: 1,
    })
    expect(layouts.get('panelImage:panel-b')).toMatchObject({
      x: 460,
      y: 28,
      zIndex: 2,
    })
  })

  it('fails explicitly when columnsPerRow is invalid', () => {
    expect(() => buildRuleGridCanvasLayout(createGraph(), {
      columnsPerRow: 0,
      nodeWidth: 100,
      nodeHeight: 80,
      columnGap: 20,
      rowGap: 30,
      laneGap: 50,
      originX: 10,
      originY: 20,
    })).toThrow('columnsPerRow must be greater than 0')
  })
})
