import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QueryClient } from '@tanstack/react-query'
import type { GlobalCharacter, GlobalLocation } from '@/lib/query/hooks/useGlobalAssets'
import type { AssetSummary } from '@/lib/assets/contracts'
import { queryKeys } from '@/lib/query/keys'
import { MockQueryClient } from '../../helpers/mock-query-client'

let queryClient = new MockQueryClient()
const useQueryClientMock = vi.fn(() => queryClient)
const useMutationMock = vi.fn((options: unknown) => options)

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return {
    ...actual,
    useRef: <T,>(value: T) => ({ current: value }),
  }
})

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => useQueryClientMock(),
  useMutation: (options: unknown) => useMutationMock(options),
}))

vi.mock('@/lib/query/mutations/mutation-shared', async () => {
  const actual = await vi.importActual<typeof import('@/lib/query/mutations/mutation-shared')>(
    '@/lib/query/mutations/mutation-shared',
  )
  return {
    ...actual,
    requestJsonWithError: vi.fn(),
    requestVoidWithError: vi.fn(),
  }
})

import {
  useGenerateCharacterImage,
  useSelectCharacterImage,
} from '@/lib/query/mutations/asset-hub-character-mutations'
import { useCreateAssetHubCharacter } from '@/lib/query/mutations/asset-hub-creation-mutations'
import { useDeleteLocation as useDeleteAssetHubLocation } from '@/lib/query/mutations/asset-hub-location-mutations'
import { invalidateGlobalCharacters } from '@/lib/query/mutations/asset-hub-mutations-shared'

interface SelectCharacterMutation {
  onMutate: (variables: {
    characterId: string
    appearanceIndex: number
    imageIndex: number | null
  }) => Promise<unknown>
  onError: (error: unknown, variables: unknown, context: unknown) => void
}

interface GenerateCharacterMutation {
  onMutate: (variables: {
    characterId: string
    appearanceId: string
    appearanceIndex: number
  }) => Promise<unknown>
  onSuccess: (
    data: { taskId?: string | null },
    variables: { appearanceId: string },
  ) => void
  onError: (error: unknown, variables: { appearanceId: string }, context: unknown) => void
}

interface CreateCharacterMutation {
  onSuccess: (
    data: { character?: GlobalCharacter },
    variables: {
      name: string
      description: string
      artStyle: string
      folderId?: string | null
      generateFromReference?: boolean
    },
  ) => void
}

interface DeleteLocationMutation {
  onMutate: (locationId: string) => Promise<unknown>
  onError: (error: unknown, locationId: string, context: unknown) => void
}

function buildGlobalCharacter(selectedIndex: number | null): GlobalCharacter {
  return {
    id: 'character-1',
    name: 'Hero',
    folderId: 'folder-1',
    customVoiceUrl: null,
    appearances: [{
      id: 'appearance-1',
      appearanceIndex: 0,
      changeReason: 'default',
      artStyle: 'realistic',
      description: null,
      descriptionSource: null,
      imageUrl: selectedIndex === null ? null : `img-${selectedIndex}`,
      imageUrls: ['img-0', 'img-1', 'img-2'],
      selectedIndex,
      previousImageUrl: null,
      previousImageUrls: [],
      imageTaskRunning: false,
    }],
  }
}

function buildGlobalLocation(id: string): GlobalLocation {
  return {
    id,
    name: `Location ${id}`,
    summary: null,
    folderId: 'folder-1',
    artStyle: 'realistic',
    images: [{
      id: `${id}-img-0`,
      imageIndex: 0,
      description: null,
      imageUrl: null,
      previousImageUrl: null,
      isSelected: true,
      imageTaskRunning: false,
    }],
  }
}

function buildUnifiedCharacter(selectedIndex: number | null): AssetSummary {
  return {
    id: 'character-1',
    scope: 'global',
    kind: 'character',
    family: 'visual',
    name: 'Hero',
    folderId: 'folder-1',
    capabilities: {
      canGenerate: true,
      canSelectRender: true,
      canRevertRender: true,
      canModifyRender: true,
      canUploadRender: true,
      canBindVoice: true,
      canCopyFromGlobal: true,
    },
    taskRefs: [],
    taskState: { isRunning: false, lastError: null },
    variants: [{
      id: 'appearance-1',
      index: 0,
      label: 'default',
      description: null,
      selectionState: { selectedRenderIndex: selectedIndex },
      taskRefs: [],
      taskState: { isRunning: false, lastError: null },
      renders: [0, 1, 2].map((index) => ({
        id: `appearance-1:${index}`,
        index,
        imageUrl: `img-${index}`,
        media: null,
        isSelected: selectedIndex === index,
        previousImageUrl: null,
        previousMedia: null,
        taskRefs: [],
        taskState: { isRunning: false, lastError: null },
      })),
    }],
    introduction: null,
    profileData: null,
    profileConfirmed: null,
    voice: {
      voiceType: null,
      voiceId: null,
      customVoiceUrl: null,
      media: null,
    },
  }
}

function buildUnifiedLocation(id: string): AssetSummary {
  return {
    id,
    scope: 'global',
    kind: 'location',
    family: 'visual',
    name: `Location ${id}`,
    folderId: 'folder-1',
    capabilities: {
      canGenerate: true,
      canSelectRender: true,
      canRevertRender: true,
      canModifyRender: true,
      canUploadRender: true,
      canBindVoice: false,
      canCopyFromGlobal: true,
    },
    taskRefs: [],
    taskState: { isRunning: false, lastError: null },
    summary: null,
    selectedVariantId: `${id}-img-0`,
    variants: [{
      id: `${id}-img-0`,
      index: 0,
      label: 'Image 1',
      description: null,
      selectionState: { selectedRenderIndex: 0 },
      taskRefs: [],
      taskState: { isRunning: false, lastError: null },
      renders: [{
        id: `${id}-img-0`,
        index: 0,
        imageUrl: null,
        media: null,
        isSelected: true,
        previousImageUrl: null,
        previousMedia: null,
        taskRefs: [],
        taskState: { isRunning: false, lastError: null },
      }],
    }],
  }
}

describe('asset hub optimistic mutations', () => {
  beforeEach(() => {
    queryClient = new MockQueryClient()
    useQueryClientMock.mockClear()
    useMutationMock.mockClear()
  })

  it('seeds created global characters into unified asset caches before refetch', () => {
    const allCharactersKey = queryKeys.globalAssets.characters()
    const folderCharactersKey = queryKeys.globalAssets.characters('folder-1')
    const otherFolderCharactersKey = queryKeys.globalAssets.characters('folder-2')
    const unifiedAssetsKey = queryKeys.assets.list({ scope: 'global' })
    const folderUnifiedAssetsKey = queryKeys.assets.list({ scope: 'global', folderId: 'folder-1' })
    const locationsUnifiedAssetsKey = queryKeys.assets.list({ scope: 'global', kind: 'location' })

    queryClient.seedQuery(allCharactersKey, [])
    queryClient.seedQuery(folderCharactersKey, [])
    queryClient.seedQuery(otherFolderCharactersKey, [])
    queryClient.seedQuery(unifiedAssetsKey, [])
    queryClient.seedQuery(folderUnifiedAssetsKey, [])
    queryClient.seedQuery(locationsUnifiedAssetsKey, [])

    const mutation = useCreateAssetHubCharacter() as unknown as CreateCharacterMutation
    mutation.onSuccess(
      { character: buildGlobalCharacter(null) },
      { name: 'Hero', description: 'desc', artStyle: 'realistic', folderId: 'folder-1' },
    )

    expect(queryClient.getQueryData<GlobalCharacter[]>(allCharactersKey)?.[0]?.id).toBe('character-1')
    expect(queryClient.getQueryData<GlobalCharacter[]>(folderCharactersKey)?.[0]?.id).toBe('character-1')
    expect(queryClient.getQueryData<GlobalCharacter[]>(otherFolderCharactersKey)).toEqual([])
    expect(queryClient.getQueryData<AssetSummary[]>(unifiedAssetsKey)?.[0]?.id).toBe('character-1')
    expect(queryClient.getQueryData<AssetSummary[]>(folderUnifiedAssetsKey)?.[0]?.id).toBe('character-1')
    expect(queryClient.getQueryData<AssetSummary[]>(locationsUnifiedAssetsKey)).toEqual([])
  })

  it('adds reference-to-character task overlay when reference creation enqueues generation', () => {
    const unifiedAssetsKey = queryKeys.assets.list({ scope: 'global' })
    queryClient.seedQuery(unifiedAssetsKey, [])

    const mutation = useCreateAssetHubCharacter() as unknown as CreateCharacterMutation
    mutation.onSuccess(
      { character: buildGlobalCharacter(null) },
      {
        name: 'Hero',
        description: 'desc',
        artStyle: 'realistic',
        folderId: 'folder-1',
        generateFromReference: true,
      },
    )

    const unified = queryClient.getQueryData<AssetSummary[]>(unifiedAssetsKey)
    const overlay = queryClient.getQueryData<Record<string, { phase: string; runningTaskType: string | null }>>(
      queryKeys.tasks.targetStateOverlay('global-asset-hub'),
    )
    const variantTaskTypes = unified?.[0]?.kind === 'character'
      ? unified[0].variants[0]?.taskRefs[0]?.types
      : []
    expect(variantTaskTypes).toContain('asset_hub_reference_to_character')
    expect(overlay?.['GlobalCharacterAppearance:appearance-1']?.phase).toBe('queued')
    expect(overlay?.['GlobalCharacterAppearance:appearance-1']?.runningTaskType).toBe('asset_hub_reference_to_character')
  })

  it('marks global character generation as running in legacy and unified caches', async () => {
    const allCharactersKey = queryKeys.globalAssets.characters()
    const unifiedAssetsKey = queryKeys.assets.list({ scope: 'global' })
    queryClient.seedQuery(allCharactersKey, [buildGlobalCharacter(null)])
    queryClient.seedQuery(unifiedAssetsKey, [buildUnifiedCharacter(null)])

    const mutation = useGenerateCharacterImage() as unknown as GenerateCharacterMutation
    const context = await mutation.onMutate({
      characterId: 'character-1',
      appearanceId: 'appearance-1',
      appearanceIndex: 0,
    })

    const afterLegacy = queryClient.getQueryData<GlobalCharacter[]>(allCharactersKey)
    const afterUnified = queryClient.getQueryData<AssetSummary[]>(unifiedAssetsKey)
    const overlay = queryClient.getQueryData<Record<string, { phase: string }>>(
      queryKeys.tasks.targetStateOverlay('global-asset-hub'),
    )
    expect(afterLegacy?.[0]?.appearances[0]?.imageTaskRunning).toBe(true)
    expect(afterUnified?.[0]?.taskState.isRunning).toBe(true)
    expect(afterUnified?.[0]?.kind === 'character' ? afterUnified[0].variants[0]?.taskState.isRunning : false).toBe(true)
    expect(overlay?.['GlobalCharacterAppearance:appearance-1']?.phase).toBe('queued')

    mutation.onSuccess({ taskId: 'task-1' }, { appearanceId: 'appearance-1' })

    const confirmedOverlay = queryClient.getQueryData<Record<string, { runningTaskId: string | null; runningTaskType: string | null }>>(
      queryKeys.tasks.targetStateOverlay('global-asset-hub'),
    )
    expect(confirmedOverlay?.['GlobalCharacterAppearance:appearance-1']?.runningTaskId).toBe('task-1')
    expect(confirmedOverlay?.['GlobalCharacterAppearance:appearance-1']?.runningTaskType).toBe('asset_hub_image')

    mutation.onError(new Error('generate failed'), { appearanceId: 'appearance-1' }, context)

    const rolledBackLegacy = queryClient.getQueryData<GlobalCharacter[]>(allCharactersKey)
    const rolledBackUnified = queryClient.getQueryData<AssetSummary[]>(unifiedAssetsKey)
    const rolledBackOverlay = queryClient.getQueryData<Record<string, unknown>>(
      queryKeys.tasks.targetStateOverlay('global-asset-hub'),
    )
    expect(rolledBackLegacy?.[0]?.appearances[0]?.imageTaskRunning).toBe(false)
    expect(rolledBackUnified?.[0]?.taskState.isRunning).toBe(false)
    expect(rolledBackOverlay?.['GlobalCharacterAppearance:appearance-1']).toBeUndefined()
  })

  it('updates all character query caches optimistically and ignores stale rollback', async () => {
    const allCharactersKey = queryKeys.globalAssets.characters()
    const folderCharactersKey = queryKeys.globalAssets.characters('folder-1')
    const unifiedAssetsKey = queryKeys.assets.list({ scope: 'global' })
    queryClient.seedQuery(allCharactersKey, [buildGlobalCharacter(0)])
    queryClient.seedQuery(folderCharactersKey, [buildGlobalCharacter(0)])
    queryClient.seedQuery(unifiedAssetsKey, [buildUnifiedCharacter(0)])

    const mutation = useSelectCharacterImage() as unknown as SelectCharacterMutation
    const firstVariables = {
      characterId: 'character-1',
      appearanceIndex: 0,
      imageIndex: 1,
    }
    const secondVariables = {
      characterId: 'character-1',
      appearanceIndex: 0,
      imageIndex: 2,
    }

    const firstContext = await mutation.onMutate(firstVariables)
    const afterFirstAll = queryClient.getQueryData<GlobalCharacter[]>(allCharactersKey)
    const afterFirstFolder = queryClient.getQueryData<GlobalCharacter[]>(folderCharactersKey)
    const afterFirstUnified = queryClient.getQueryData<AssetSummary[]>(unifiedAssetsKey)
    expect(afterFirstAll?.[0]?.appearances[0]?.selectedIndex).toBe(1)
    expect(afterFirstFolder?.[0]?.appearances[0]?.selectedIndex).toBe(1)
    expect(afterFirstUnified?.[0]?.kind === 'character' ? afterFirstUnified[0].variants[0]?.selectionState.selectedRenderIndex : null).toBe(1)

    const secondContext = await mutation.onMutate(secondVariables)
    const afterSecondAll = queryClient.getQueryData<GlobalCharacter[]>(allCharactersKey)
    const afterSecondUnified = queryClient.getQueryData<AssetSummary[]>(unifiedAssetsKey)
    expect(afterSecondAll?.[0]?.appearances[0]?.selectedIndex).toBe(2)
    expect(afterSecondUnified?.[0]?.kind === 'character' ? afterSecondUnified[0].variants[0]?.selectionState.selectedRenderIndex : null).toBe(2)

    mutation.onError(new Error('first failed'), firstVariables, firstContext)
    const afterStaleError = queryClient.getQueryData<GlobalCharacter[]>(allCharactersKey)
    const unifiedAfterStaleError = queryClient.getQueryData<AssetSummary[]>(unifiedAssetsKey)
    expect(afterStaleError?.[0]?.appearances[0]?.selectedIndex).toBe(2)
    expect(unifiedAfterStaleError?.[0]?.kind === 'character' ? unifiedAfterStaleError[0].variants[0]?.selectionState.selectedRenderIndex : null).toBe(2)

    mutation.onError(new Error('second failed'), secondVariables, secondContext)
    const afterLatestRollback = queryClient.getQueryData<GlobalCharacter[]>(allCharactersKey)
    const unifiedAfterLatestRollback = queryClient.getQueryData<AssetSummary[]>(unifiedAssetsKey)
    expect(afterLatestRollback?.[0]?.appearances[0]?.selectedIndex).toBe(1)
    expect(unifiedAfterLatestRollback?.[0]?.kind === 'character' ? unifiedAfterLatestRollback[0].variants[0]?.selectionState.selectedRenderIndex : null).toBe(1)
  })

  it('optimistically removes location and restores on error', async () => {
    const allLocationsKey = queryKeys.globalAssets.locations()
    const folderLocationsKey = queryKeys.globalAssets.locations('folder-1')
    const unifiedAssetsKey = queryKeys.assets.list({ scope: 'global' })
    queryClient.seedQuery(allLocationsKey, [buildGlobalLocation('loc-1'), buildGlobalLocation('loc-2')])
    queryClient.seedQuery(folderLocationsKey, [buildGlobalLocation('loc-1')])
    queryClient.seedQuery(unifiedAssetsKey, [buildUnifiedLocation('loc-1'), buildUnifiedLocation('loc-2')])

    const mutation = useDeleteAssetHubLocation() as unknown as DeleteLocationMutation
    const context = await mutation.onMutate('loc-1')

    const afterDeleteAll = queryClient.getQueryData<GlobalLocation[]>(allLocationsKey)
    const afterDeleteFolder = queryClient.getQueryData<GlobalLocation[]>(folderLocationsKey)
    const unifiedAfterDelete = queryClient.getQueryData<AssetSummary[]>(unifiedAssetsKey)
    expect(afterDeleteAll?.map((item) => item.id)).toEqual(['loc-2'])
    expect(afterDeleteFolder).toEqual([])
    expect(unifiedAfterDelete?.map((item) => item.id)).toEqual(['loc-2'])

    mutation.onError(new Error('delete failed'), 'loc-1', context)

    const rolledBackAll = queryClient.getQueryData<GlobalLocation[]>(allLocationsKey)
    const rolledBackFolder = queryClient.getQueryData<GlobalLocation[]>(folderLocationsKey)
    const unifiedAfterRollback = queryClient.getQueryData<AssetSummary[]>(unifiedAssetsKey)
    expect(rolledBackAll?.map((item) => item.id)).toEqual(['loc-1', 'loc-2'])
    expect(rolledBackFolder?.map((item) => item.id)).toEqual(['loc-1'])
    expect(unifiedAfterRollback?.map((item) => item.id)).toEqual(['loc-1', 'loc-2'])
  })

  it('global asset invalidation refreshes unified asset queries and legacy character queries', () => {
    invalidateGlobalCharacters(queryClient as unknown as QueryClient)

    expect(queryClient.invalidations.some((arg) => {
      const key = arg.queryKey || []
      return Array.isArray(key)
        && key[0] === queryKeys.assets.all('global')[0]
        && key[1] === 'unified'
    })).toBe(true)

    expect(queryClient.invalidations.some((arg) => {
      const key = arg.queryKey || []
      return Array.isArray(key)
        && key[0] === queryKeys.globalAssets.characters()[0]
        && key[1] === 'characters'
    })).toBe(true)
  })
})
