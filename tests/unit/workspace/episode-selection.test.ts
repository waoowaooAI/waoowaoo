import { describe, expect, it } from 'vitest'
import { resolveSelectedEpisodeId } from '@/app/[locale]/workspace/[projectId]/episode-selection'

describe('resolveSelectedEpisodeId', () => {
  it('returns null when episodes list is empty', () => {
    expect(resolveSelectedEpisodeId([], null)).toBeNull()
    expect(resolveSelectedEpisodeId([], 'ep-1')).toBeNull()
  })

  it('uses url episode id when it exists in list', () => {
    const episodes = [{ id: 'ep-1' }, { id: 'ep-2' }]
    expect(resolveSelectedEpisodeId(episodes, 'ep-2')).toBe('ep-2')
  })

  it('falls back to first episode when url episode id is missing', () => {
    const episodes = [{ id: 'ep-1' }, { id: 'ep-2' }]
    expect(resolveSelectedEpisodeId(episodes, null)).toBe('ep-1')
  })

  it('falls back to first episode when url episode id is invalid', () => {
    const episodes = [{ id: 'ep-1' }, { id: 'ep-2' }]
    expect(resolveSelectedEpisodeId(episodes, 'ep-404')).toBe('ep-1')
  })
})
