import * as React from 'react'
import { createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const {
  useQueryClientMock,
  useMutationMock,
  requestJsonWithErrorMock,
  requestTaskResponseWithErrorMock,
} = vi.hoisted(() => ({
  useQueryClientMock: vi.fn(() => ({ invalidateQueries: vi.fn() })),
  useMutationMock: vi.fn((options: unknown) => options),
  requestJsonWithErrorMock: vi.fn(),
  requestTaskResponseWithErrorMock: vi.fn(),
}))

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
    invalidateQueryTemplates: vi.fn(),
    requestJsonWithError: requestJsonWithErrorMock,
    requestTaskResponseWithError: requestTaskResponseWithErrorMock,
  }
})

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    if (values && 'name' in values) {
      return `${key}:${String(values.name)}`
    }
    return key
  },
}))

vi.mock('@/components/story-input/StoryInputComposer', () => ({
  default: ({
    minRows,
    maxHeightViewportRatio,
    textareaClassName,
    topRight,
    footer,
    secondaryActions,
    primaryAction,
  }: {
    minRows: number
    maxHeightViewportRatio: number
    textareaClassName?: string
    topRight?: React.ReactNode
    footer?: React.ReactNode
    secondaryActions?: React.ReactNode
    primaryAction: React.ReactNode
  }) => createElement(
    'section',
    {
      'data-min-rows': String(minRows),
      'data-max-height-ratio': String(maxHeightViewportRatio),
      'data-textarea-class': textareaClassName,
    },
    topRight,
    footer,
    secondaryActions,
    primaryAction,
    'StoryInputComposer',
  ),
}))

vi.mock('@/components/task/TaskStatusInline', () => ({
  default: () => createElement('span', null, 'TaskStatusInline'),
}))

vi.mock('@/components/home/AiWriteModal', () => ({
  default: () => createElement('div', null, 'AiWriteModal'),
}))

vi.mock('@/lib/api-fetch', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-fetch')>('@/lib/api-fetch')
  return {
    ...actual,
    apiFetch: vi.fn(),
  }
})

vi.mock('@/lib/home/ai-story-expand', () => ({
  expandHomeStory: vi.fn(),
}))

vi.mock('@/components/ui/icons', () => ({
  AppIcon: ({ name, ...props }: { name: string } & Record<string, unknown>) =>
    createElement('span', { ...props, 'data-icon': name }),
}))

import {
  isGlobalAnalyzeTaskRunning,
  resolveGlobalAnalyzeCompletion,
} from '@/features/project-workspace/components/assets/hooks/useAssetsGlobalActions'
import { useConfirmProjectLocationSelection } from '@/lib/query/mutations/location-management-mutations'
import { useAnalyzeProjectGlobalAssets } from '@/lib/query/mutations/useProjectConfigMutations'
import {
  hasScriptArtifacts,
  hasStoryboardArtifacts,
  hasVideoArtifacts,
  resolveEpisodeStageArtifacts,
} from '@/lib/project-workflow/stage-readiness'
import ProjectInputStage from '@/features/project-workspace/components/ProjectInputStage'

interface ConfirmLocationSelectionMutation {
  mutationFn: (variables: { locationId: string; imageIndex: number }) => Promise<unknown>
}

interface AnalyzeGlobalMutation {
  mutationFn: () => Promise<unknown>
}

describe('assets global actions task state helpers', () => {
  it('treats queued and processing analyze task as running', () => {
    expect(isGlobalAnalyzeTaskRunning({
      phase: 'queued',
      runningTaskId: 'task-1',
      lastError: null,
    })).toBe(true)

    expect(isGlobalAnalyzeTaskRunning({
      phase: 'processing',
      runningTaskId: 'task-1',
      lastError: null,
    })).toBe(true)
  })

  it('keeps completion idle when there is no previously running task', () => {
    expect(resolveGlobalAnalyzeCompletion(null, {
      phase: 'completed',
      runningTaskId: null,
      lastError: null,
    })).toEqual({
      status: 'idle',
      finishedTaskId: null,
      errorMessage: null,
    })
  })

  it('marks previously running task as succeeded once runtime state stops running', () => {
    expect(resolveGlobalAnalyzeCompletion('task-2', {
      phase: 'completed',
      runningTaskId: null,
      lastError: null,
    })).toEqual({
      status: 'succeeded',
      finishedTaskId: 'task-2',
      errorMessage: null,
    })
  })

  it('surfaces failed completion message from task state', () => {
    expect(resolveGlobalAnalyzeCompletion('task-3', {
      phase: 'failed',
      runningTaskId: null,
      lastError: {
        code: 'MODEL_NOT_CONFIGURED',
        message: 'No model configured',
      },
    })).toEqual({
      status: 'failed',
      finishedTaskId: 'task-3',
      errorMessage: 'No model configured',
    })
  })
})

describe('project location-backed confirm mutations', () => {
  beforeEach(() => {
    useQueryClientMock.mockClear()
    useMutationMock.mockClear()
    requestJsonWithErrorMock.mockReset()
    requestJsonWithErrorMock.mockResolvedValue({ success: true })
    requestTaskResponseWithErrorMock.mockReset()
  })

  it('routes prop confirmation to the unified asset select-render endpoint', async () => {
    const mutation = useConfirmProjectLocationSelection('project-1', 'prop') as unknown as ConfirmLocationSelectionMutation

    await mutation.mutationFn({ locationId: 'prop-1', imageIndex: 1 })

    expect(requestJsonWithErrorMock).toHaveBeenCalledTimes(1)
    expect(requestJsonWithErrorMock).toHaveBeenCalledWith(
      '/api/assets/prop-1/select-render',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: 'project',
          kind: 'prop',
          projectId: 'project-1',
          confirm: true,
          imageIndex: 1,
        }),
      },
      '确认选择失败',
    )
  })
})

describe('project global analyze mutation', () => {
  beforeEach(() => {
    useQueryClientMock.mockClear()
    useMutationMock.mockClear()
    requestTaskResponseWithErrorMock.mockReset()
  })

  it('returns async task submission instead of waiting for final task result', async () => {
    requestTaskResponseWithErrorMock.mockResolvedValue({
      json: async () => ({
        async: true,
        taskId: 'task-global-1',
        status: 'queued',
        deduped: false,
      }),
    } as Response)

    const mutation = useAnalyzeProjectGlobalAssets('project-1') as unknown as AnalyzeGlobalMutation
    const result = await mutation.mutationFn() as { taskId: string; async: boolean }

    expect(requestTaskResponseWithErrorMock).toHaveBeenCalledWith(
      '/api/projects/project-1/analyze-global',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ async: true }),
      },
      'Failed to analyze global assets',
    )
    expect(result).toEqual({
      async: true,
      taskId: 'task-global-1',
      status: 'queued',
      deduped: false,
    })
  })

  it('fails explicitly when route does not return an async task submission payload', async () => {
    requestTaskResponseWithErrorMock.mockResolvedValue({
      json: async () => ({ success: true }),
    } as Response)

    const mutation = useAnalyzeProjectGlobalAssets('project-1') as unknown as AnalyzeGlobalMutation

    await expect(mutation.mutationFn()).rejects.toThrow('Failed to submit global asset analysis task')
  })
})

describe('stage readiness', () => {
  it('treats script as ready only when at least one clip has non-empty screenplay', () => {
    expect(hasScriptArtifacts([])).toBe(false)
    expect(hasScriptArtifacts([
      { id: 'clip-1', summary: '', location: null, characters: null, props: null, content: 'a', screenplay: '' },
    ])).toBe(false)
    expect(hasScriptArtifacts([
      { id: 'clip-1', summary: '', location: null, characters: null, props: null, content: 'a', screenplay: '  {"scenes":[]}' },
    ])).toBe(true)
  })

  it('treats storyboard as ready only when at least one storyboard has panels', () => {
    expect(hasStoryboardArtifacts([])).toBe(false)
    expect(hasStoryboardArtifacts([{ panels: [] }])).toBe(false)
    expect(hasStoryboardArtifacts([{ panels: [{ id: 'panel-1' }] }])).toBe(true)
  })

  it('treats video as ready only when at least one panel has videoUrl', () => {
    expect(hasVideoArtifacts([{ panels: [{ id: 'panel-1', videoUrl: '' }] }])).toBe(false)
    expect(hasVideoArtifacts([{ panels: [{ id: 'panel-1', videoUrl: 'https://example.com/video.mp4' }] }])).toBe(true)
  })

  it('derives full episode stage artifacts from persisted outputs', () => {
    const readiness = resolveEpisodeStageArtifacts({
      novelText: 'story',
      clips: [
        { id: 'clip-1', summary: '', location: null, characters: null, props: null, content: 'a', screenplay: '{"scenes":[]}' },
      ],
      storyboards: [
        {
          id: 'sb-1',
          episodeId: 'ep-1',
          clipId: 'clip-1',
          storyboardTextJson: null,
          panelCount: 1,
          storyboardImageUrl: null,
          panels: [{
            id: 'panel-1',
            storyboardId: 'sb-1',
            panelIndex: 0,
            panelNumber: 1,
            shotType: null,
            cameraMove: null,
            description: null,
            location: null,
            characters: null,
            props: null,
            srtSegment: null,
            srtStart: null,
            srtEnd: null,
            duration: null,
            imagePrompt: null,
            imageUrl: null,
            imageHistory: null,
            videoPrompt: null,
            videoUrl: 'https://example.com/video.mp4',
            photographyRules: null,
            actingNotes: null,
          }],
        },
      ],
      voiceLines: [{ id: 'voice-1' }],
    })

    expect(readiness).toEqual({
      hasStory: true,
      hasScript: true,
      hasStoryboard: true,
      hasVideo: true,
      hasVoice: true,
    })
  })
})

describe('ProjectInputStage', () => {
  it('uses the shared composer with a taller adaptive baseline in story mode', () => {
    Reflect.set(globalThis, 'React', React)

    const html = renderToStaticMarkup(
      createElement(ProjectInputStage, {
        novelText: '',
        episodeName: '剧集 1',
        onNovelTextChange: () => undefined,
        onNext: () => undefined,
      }),
    )

    expect(html).toContain('StoryInputComposer')
    expect(html).toContain('data-min-rows="8"')
    expect(html).toContain('data-max-height-ratio="0.5"')
    expect(html).toContain('data-textarea-class="px-0 pt-0 pb-3 align-top"')
    expect(html).toContain('aiWrite.trigger')
    expect(html).toContain('AiWriteModal')
    expect(html).not.toContain('storyInput.wordCount 0')
    expect(html).not.toContain('storyInput.currentConfigSummary')
  })
})
