import { describe, expect, it } from 'vitest'
import {
  parseCanvasLayoutReadResponse,
} from '@/lib/project-canvas/layout/canvas-layout-error-policy'

const validLayout = {
  projectId: 'project-1',
  episodeId: 'episode-1',
  schemaVersion: 1,
  viewport: { x: 10, y: 20, zoom: 0.8 },
  nodeLayouts: [{
    nodeKey: 'workspace-stage:episode-1:story',
    nodeType: 'story',
    targetType: 'episode',
    targetId: 'episode-1',
    x: 0,
    y: 0,
    width: 520,
    height: 620,
    zIndex: 0,
    locked: false,
    collapsed: false,
  }],
}

describe('canvas layout error policy', () => {
  it('returns the saved layout when the response matches the active schema', () => {
    expect(parseCanvasLayoutReadResponse({
      success: true,
      layout: validLayout,
    })).toEqual({
      layout: validLayout,
      warningCode: null,
    })
  })

  it('drops incompatible schema versions and reports a visible warning code', () => {
    expect(parseCanvasLayoutReadResponse({
      success: true,
      layout: {
        ...validLayout,
        schemaVersion: 999,
      },
    })).toEqual({
      layout: null,
      warningCode: 'schema_mismatch',
    })
  })

  it('throws on malformed active-schema payloads instead of fabricating layout data', () => {
    expect(() => parseCanvasLayoutReadResponse({
      success: true,
      layout: {
        ...validLayout,
        viewport: { x: 0, y: 0, zoom: 0 },
      },
    })).toThrow('invalid canvas layout snapshot')
  })
})
