import { describe, expect, it } from 'vitest'
import { normalizeWorkspaceStage } from '@/lib/workspace/stage-alias'

describe('normalizeWorkspaceStage', () => {
  it('falls back to config for empty or invalid stage', () => {
    expect(normalizeWorkspaceStage(null)).toBe('config')
    expect(normalizeWorkspaceStage(undefined)).toBe('config')
    expect(normalizeWorkspaceStage('unknown-stage')).toBe('config')
  })

  it('keeps panels alias as first-class stage (manga lane identity)', () => {
    expect(normalizeWorkspaceStage('panels')).toBe('panels')
  })

  it('keeps videos stage unchanged', () => {
    expect(normalizeWorkspaceStage('videos')).toBe('videos')
  })

  it('maps editor to videos for backward compatibility', () => {
    expect(normalizeWorkspaceStage('editor')).toBe('videos')
  })
})
