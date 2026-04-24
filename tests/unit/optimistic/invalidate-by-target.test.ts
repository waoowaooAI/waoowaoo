import { describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { invalidateByTarget } from '@/lib/query/invalidation/invalidate-by-target'
import { queryKeys } from '@/lib/query/keys'

type InvalidateArg = { queryKey?: readonly unknown[]; exact?: boolean }

function createQueryClient() {
  const queryClient = new QueryClient()
  const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue()
  return { queryClient, invalidateQueries }
}

function hasInvalidation(
  queryClient: ReturnType<typeof createQueryClient>,
  predicate: (arg: InvalidateArg) => boolean,
) {
  return queryClient.invalidateQueries.mock.calls.some((call) => {
    const arg = (call[0] || {}) as InvalidateArg
    return predicate(arg)
  })
}

describe('invalidateByTarget', () => {
  it('ProjectPanel invalidates episode scoped GUI queries', () => {
    const testClient = createQueryClient()

    invalidateByTarget({
      queryClient: testClient.queryClient,
      projectId: 'project-1',
      targetType: 'ProjectPanel',
      episodeId: 'episode-1',
    })

    expect(hasInvalidation(testClient, (arg) => {
      const key = arg.queryKey || []
      return Array.isArray(key)
        && key[0] === queryKeys.episodeData('project-1', 'episode-1')[0]
        && key[1] === 'project-1'
        && key[2] === 'episode-1'
    })).toBe(true)
    expect(hasInvalidation(testClient, (arg) => {
      const key = arg.queryKey || []
      return Array.isArray(key)
        && key[0] === queryKeys.storyboards.all('episode-1')[0]
        && key[1] === 'episode-1'
    })).toBe(true)
    expect(hasInvalidation(testClient, (arg) => {
      const key = arg.queryKey || []
      return Array.isArray(key)
        && key[0] === queryKeys.voiceLines.all('episode-1')[0]
        && key[1] === 'episode-1'
    })).toBe(true)
    expect(hasInvalidation(testClient, (arg) => {
      const key = arg.queryKey || []
      return Array.isArray(key)
        && key[0] === queryKeys.voiceLines.matched('project-1', 'episode-1')[0]
        && key[1] === 'project-1'
        && key[2] === 'episode-1'
    })).toBe(true)
  })

  it('ProjectCharacter invalidates project asset queries', () => {
    const testClient = createQueryClient()

    invalidateByTarget({
      queryClient: testClient.queryClient,
      projectId: 'project-1',
      targetType: 'ProjectCharacter',
      episodeId: null,
    })

    expect(hasInvalidation(testClient, (arg) => {
      const key = arg.queryKey || []
      return Array.isArray(key)
        && key[0] === queryKeys.projectAssets.characters('project-1')[0]
        && key[1] === 'project-1'
        && key[2] === 'characters'
    })).toBe(true)
    expect(hasInvalidation(testClient, (arg) => {
      const key = arg.queryKey || []
      return Array.isArray(key)
        && key[0] === queryKeys.projectAssets.all('project-1')[0]
        && key[1] === 'project-1'
    })).toBe(true)
  })

  it('GlobalVoice invalidates global voice asset queries', () => {
    const testClient = createQueryClient()

    invalidateByTarget({
      queryClient: testClient.queryClient,
      projectId: 'global-asset-hub',
      targetType: 'GlobalVoice',
      episodeId: null,
    })

    expect(hasInvalidation(testClient, (arg) => {
      const key = arg.queryKey || []
      return Array.isArray(key)
        && key[0] === queryKeys.globalAssets.voices()[0]
        && key[1] === 'voices'
    })).toBe(true)
    expect(hasInvalidation(testClient, (arg) => {
      const key = arg.queryKey || []
      return Array.isArray(key)
        && key[0] === queryKeys.assets.all('global')[0]
        && key[1] === 'unified'
    })).toBe(true)
  })

  it('ProjectLocation invalidates unified project asset queries', () => {
    const testClient = createQueryClient()

    invalidateByTarget({
      queryClient: testClient.queryClient,
      projectId: 'project-1',
      targetType: 'ProjectLocation',
      episodeId: null,
    })

    expect(hasInvalidation(testClient, (arg) => {
      const key = arg.queryKey || []
      return Array.isArray(key)
        && key[0] === queryKeys.assets.all('project', 'project-1')[0]
        && key[1] === 'project-1'
        && key[2] === 'unified'
    })).toBe(true)
    expect(hasInvalidation(testClient, (arg) => {
      const key = arg.queryKey || []
      return Array.isArray(key)
        && key[0] === queryKeys.projectAssets.locations('project-1')[0]
        && key[1] === 'project-1'
        && key[2] === 'locations'
    })).toBe(true)
  })

  it('ProjectAsset invalidates all unified project asset queries', () => {
    const testClient = createQueryClient()

    invalidateByTarget({
      queryClient: testClient.queryClient,
      projectId: 'project-1',
      targetType: 'ProjectAsset',
      episodeId: null,
    })

    expect(hasInvalidation(testClient, (arg) => {
      const key = arg.queryKey || []
      return Array.isArray(key)
        && key[0] === queryKeys.assets.all('project', 'project-1')[0]
        && key[1] === 'project-1'
        && key[2] === 'unified'
    })).toBe(true)
    expect(hasInvalidation(testClient, (arg) => {
      const key = arg.queryKey || []
      return Array.isArray(key)
        && key[0] === queryKeys.projectAssets.all('project-1')[0]
        && key[1] === 'project-1'
    })).toBe(true)
  })
})
