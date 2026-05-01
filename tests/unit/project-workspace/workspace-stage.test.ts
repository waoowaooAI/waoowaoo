import { describe, expect, it } from 'vitest'
import {
  isWorkspaceStage,
  resolveWorkspaceStage,
  WORKSPACE_STAGES,
} from '@/features/project-workspace/workspace-stage'

describe('workspace stage resolution', () => {
  it('accepts canvas as a valid workspace stage', () => {
    expect(WORKSPACE_STAGES).toContain('canvas')
    expect(isWorkspaceStage('canvas')).toBe(true)
    expect(resolveWorkspaceStage('canvas')).toBe('canvas')
  })

  it('keeps legacy editor requests on videos and rejects unknown stages', () => {
    expect(resolveWorkspaceStage('editor')).toBe('videos')
    expect(resolveWorkspaceStage('unknown')).toBe('config')
    expect(resolveWorkspaceStage(null)).toBe('config')
  })
})
