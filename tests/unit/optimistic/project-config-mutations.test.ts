import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Project } from '@/types/project'
import { queryKeys } from '@/lib/query/keys'
import { MockQueryClient } from '../../helpers/mock-query-client'

let queryClient = new MockQueryClient()
const useQueryClientMock = vi.fn(() => queryClient)
const useMutationMock = vi.fn((options: unknown) => options)

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
    invalidateQueryTemplates: vi.fn(),
  }
})

import { useUpdateProjectConfig } from '@/lib/query/mutations/useProjectConfigMutations'
import { useUpdateProjectEpisodeField } from '@/lib/query/mutations/useEpisodeMutations'

interface ConfigMutation {
  onMutate: (variables: { key: string; value: unknown }) => Promise<unknown>
}

interface EpisodeMutation {
  onMutate: (variables: { episodeId: string; key: string; value: unknown }) => Promise<unknown>
}

function buildProject(): Project {
  return {
    id: 'project-1',
    name: 'Project One',
    description: null,
    userId: 'user-1',
    createdAt: new Date('2026-04-15T00:00:00.000Z'),
    updatedAt: new Date('2026-04-15T00:00:00.000Z'),
    analysisModel: 'llm::old',
    episodes: [{
      id: 'episode-1',
      episodeNumber: 1,
      name: 'Episode 1',
      description: null,
      novelText: 'old text',
      audioUrl: null,
      srtContent: null,
      createdAt: new Date('2026-04-15T00:00:00.000Z'),
      updatedAt: new Date('2026-04-15T00:00:00.000Z'),
    }],
    globalAssetText: null,
    imageModel: null,
    characterModel: null,
    locationModel: null,
    storyboardModel: null,
    editModel: null,
    videoModel: null,
    audioModel: null,
    videoRatio: '9:16',
    capabilityOverrides: null,
    artStyle: 'american-comic',
    artStylePrompt: null,
    visualStylePresetSource: 'system',
    visualStylePresetId: 'american-comic',
    directorStylePresetSource: null,
    directorStylePresetId: null,
    directorStyleDoc: null,
    characters: [],
    locations: [],
    props: [],
    clips: [],
    storyboards: [],
    shots: [],
    videoResolution: null,
    imageResolution: null,
    lastEpisodeId: null,
    importStatus: null,
  }
}

describe('project config optimistic mutations', () => {
  beforeEach(() => {
    queryClient = new MockQueryClient()
    useQueryClientMock.mockClear()
    useMutationMock.mockClear()
  })

  it('optimistically updates project config at the top level', async () => {
    const projectId = 'project-1'
    const projectKey = queryKeys.projectData(projectId)
    queryClient.seedQuery(projectKey, buildProject())

    const mutation = useUpdateProjectConfig(projectId) as unknown as ConfigMutation
    await mutation.onMutate({ key: 'analysisModel', value: 'llm::new' })

    const afterMutate = queryClient.getQueryData<Project>(projectKey)
    expect(afterMutate?.analysisModel).toBe('llm::new')
  })

  it('optimistically updates episode summaries at the project top level', async () => {
    const projectId = 'project-1'
    const projectKey = queryKeys.projectData(projectId)
    const episodeKey = queryKeys.episodeData(projectId, 'episode-1')
    queryClient.seedQuery(projectKey, buildProject())
    queryClient.seedQuery(episodeKey, { id: 'episode-1', novelText: 'old text' })

    const mutation = useUpdateProjectEpisodeField(projectId) as unknown as EpisodeMutation
    await mutation.onMutate({ episodeId: 'episode-1', key: 'novelText', value: 'new text' })

    const afterProjectMutate = queryClient.getQueryData<Project>(projectKey)
    expect(afterProjectMutate?.episodes?.[0]?.novelText).toBe('new text')
  })
})
