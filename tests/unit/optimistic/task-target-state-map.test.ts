import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TaskTargetState } from '@/lib/query/hooks/useTaskTargetStateMap'

const runtime = vi.hoisted(() => ({
  useQueryCalls: [] as Array<Record<string, unknown>>,
}))

const overlayNow = new Date().toISOString()

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return {
    ...actual,
    useMemo: <T,>(factory: () => T) => factory(),
  }
})

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: Record<string, unknown>) => {
    runtime.useQueryCalls.push(options)

    const queryKey = (options.queryKey || []) as unknown[]
    const first = queryKey[0]
    if (first === 'task-target-states-overlay') {
      return {
        data: {
          'CharacterAppearance:appearance-1': {
            targetType: 'CharacterAppearance',
            targetId: 'appearance-1',
            phase: 'processing',
            runningTaskId: 'task-ov-1',
            runningTaskType: 'IMAGE_CHARACTER',
            intent: 'process',
            hasOutputAtStart: false,
            progress: 50,
            stage: 'generate',
            stageLabel: '生成中',
            updatedAt: overlayNow,
            lastError: null,
            expiresAt: Date.now() + 30_000,
          },
          'NovelPromotionPanel:panel-1': {
            targetType: 'NovelPromotionPanel',
            targetId: 'panel-1',
            phase: 'queued',
            runningTaskId: 'task-ov-2',
            runningTaskType: 'LIP_SYNC',
            intent: 'process',
            hasOutputAtStart: null,
            progress: null,
            stage: null,
            stageLabel: null,
            updatedAt: overlayNow,
            lastError: null,
            expiresAt: Date.now() + 30_000,
          },
        },
      }
    }

    return {
      data: [
        {
          targetType: 'CharacterAppearance',
          targetId: 'appearance-1',
          phase: 'idle',
          runningTaskId: null,
          runningTaskType: null,
          intent: 'process',
          hasOutputAtStart: null,
          progress: null,
          stage: null,
          stageLabel: null,
          lastError: null,
          updatedAt: null,
        },
        {
          targetType: 'NovelPromotionPanel',
          targetId: 'panel-1',
          phase: 'processing',
          runningTaskId: 'task-api-panel',
          runningTaskType: 'IMAGE_PANEL',
          intent: 'process',
          hasOutputAtStart: null,
          progress: 10,
          stage: 'api',
          stageLabel: 'API处理中',
          lastError: null,
          updatedAt: overlayNow,
        },
      ] as TaskTargetState[],
    }
  },
}))

describe('task target state map behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    runtime.useQueryCalls = []
  })

  it('keeps polling disabled and merges overlay only when rules match', async () => {
    const { useTaskTargetStateMap } = await import('@/lib/query/hooks/useTaskTargetStateMap')

    const result = useTaskTargetStateMap('project-1', [
      { targetType: 'CharacterAppearance', targetId: 'appearance-1', types: ['IMAGE_CHARACTER'] },
      { targetType: 'NovelPromotionPanel', targetId: 'panel-1', types: ['IMAGE_PANEL'] },
    ])

    const firstCall = runtime.useQueryCalls[0]
    expect(firstCall?.refetchInterval).toBe(false)

    const appearance = result.getState('CharacterAppearance', 'appearance-1')
    expect(appearance?.phase).toBe('processing')
    expect(appearance?.runningTaskType).toBe('IMAGE_CHARACTER')
    expect(appearance?.runningTaskId).toBe('task-ov-1')

    const panel = result.getState('NovelPromotionPanel', 'panel-1')
    expect(panel?.phase).toBe('processing')
    expect(panel?.runningTaskType).toBe('IMAGE_PANEL')
    expect(panel?.runningTaskId).toBe('task-api-panel')
  })
})
