import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Character, Location, Project } from '@/types/project'
import type { ProjectAssetsData } from '@/lib/query/hooks/useProjectAssets'
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
    invalidateQueryTemplates: vi.fn(),
  }
})

import {
  useDeleteProjectCharacter,
  useSelectProjectCharacterImage,
} from '@/lib/query/mutations/character-base-mutations'

interface SelectProjectCharacterMutation {
  onMutate: (variables: {
    characterId: string
    appearanceId: string
    imageIndex: number | null
  }) => Promise<unknown>
  onError: (error: unknown, variables: unknown, context: unknown) => void
}

interface DeleteProjectCharacterMutation {
  onMutate: (characterId: string) => Promise<unknown>
  onError: (error: unknown, characterId: string, context: unknown) => void
}

function buildCharacter(selectedIndex: number | null): Character {
  return {
    id: 'character-1',
    name: 'Hero',
    appearances: [{
      id: 'appearance-1',
      appearanceIndex: 0,
      changeReason: 'default',
      description: null,
      descriptions: null,
      imageUrl: selectedIndex === null ? null : `img-${selectedIndex}`,
      imageUrls: ['img-0', 'img-1', 'img-2'],
      previousImageUrl: null,
      previousImageUrls: [],
      previousDescription: null,
      previousDescriptions: null,
      selectedIndex,
    }],
  }
}

function buildAssets(selectedIndex: number | null): ProjectAssetsData {
  return {
    characters: [buildCharacter(selectedIndex)],
    locations: [] as Location[],
  }
}

function buildProject(selectedIndex: number | null): Project {
  return {
    novelPromotionData: {
      characters: [buildCharacter(selectedIndex)],
      locations: [],
    },
  } as unknown as Project
}

describe('project asset optimistic mutations', () => {
  beforeEach(() => {
    queryClient = new MockQueryClient()
    useQueryClientMock.mockClear()
    useMutationMock.mockClear()
  })

  it('optimistically selects project character image and ignores stale rollback', async () => {
    const projectId = 'project-1'
    const assetsKey = queryKeys.projectAssets.all(projectId)
    const projectKey = queryKeys.projectData(projectId)
    queryClient.seedQuery(assetsKey, buildAssets(0))
    queryClient.seedQuery(projectKey, buildProject(0))

    const mutation = useSelectProjectCharacterImage(projectId) as unknown as SelectProjectCharacterMutation
    const firstVariables = {
      characterId: 'character-1',
      appearanceId: 'appearance-1',
      imageIndex: 1,
    }
    const secondVariables = {
      characterId: 'character-1',
      appearanceId: 'appearance-1',
      imageIndex: 2,
    }

    const firstContext = await mutation.onMutate(firstVariables)
    const afterFirst = queryClient.getQueryData<ProjectAssetsData>(assetsKey)
    expect(afterFirst?.characters[0]?.appearances[0]?.selectedIndex).toBe(1)

    const secondContext = await mutation.onMutate(secondVariables)
    const afterSecond = queryClient.getQueryData<ProjectAssetsData>(assetsKey)
    expect(afterSecond?.characters[0]?.appearances[0]?.selectedIndex).toBe(2)

    mutation.onError(new Error('first failed'), firstVariables, firstContext)
    const afterStaleError = queryClient.getQueryData<ProjectAssetsData>(assetsKey)
    expect(afterStaleError?.characters[0]?.appearances[0]?.selectedIndex).toBe(2)

    mutation.onError(new Error('second failed'), secondVariables, secondContext)
    const afterLatestRollback = queryClient.getQueryData<ProjectAssetsData>(assetsKey)
    expect(afterLatestRollback?.characters[0]?.appearances[0]?.selectedIndex).toBe(1)
  })

  it('optimistically deletes project character and restores on error', async () => {
    const projectId = 'project-1'
    const assetsKey = queryKeys.projectAssets.all(projectId)
    const projectKey = queryKeys.projectData(projectId)
    queryClient.seedQuery(assetsKey, buildAssets(0))
    queryClient.seedQuery(projectKey, buildProject(0))

    const mutation = useDeleteProjectCharacter(projectId) as unknown as DeleteProjectCharacterMutation
    const context = await mutation.onMutate('character-1')

    const afterDeleteAssets = queryClient.getQueryData<ProjectAssetsData>(assetsKey)
    expect(afterDeleteAssets?.characters).toHaveLength(0)

    const afterDeleteProject = queryClient.getQueryData<Project>(projectKey)
    expect(afterDeleteProject?.novelPromotionData?.characters ?? []).toHaveLength(0)

    mutation.onError(new Error('delete failed'), 'character-1', context)

    const rolledBackAssets = queryClient.getQueryData<ProjectAssetsData>(assetsKey)
    expect(rolledBackAssets?.characters).toHaveLength(1)
    expect(rolledBackAssets?.characters[0]?.id).toBe('character-1')
  })
})
