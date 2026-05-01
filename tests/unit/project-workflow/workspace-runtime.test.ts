import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildVideoSubmissionKey,
  createVideoSubmissionBaseline,
  shouldResolveVideoSubmissionLock,
} from '@/lib/project-workflow/stages/video-stage-runtime/immediate-video-submission'

const {
  useStateMock,
  useRefMock,
  useEffectMock,
  useCallbackMock,
  useMemoMock,
  analyzeMutateAsyncMock,
  storyToScriptRunMock,
  storyToScriptResetMock,
  scriptToStoryboardRunMock,
  scriptToStoryboardResetMock,
  emitWorkspaceAssistantWorkflowEventMock,
} = vi.hoisted(() => ({
  useStateMock: vi.fn(),
  useRefMock: vi.fn((value: unknown) => ({ current: value })),
  useEffectMock: vi.fn(),
  useCallbackMock: vi.fn((fn: unknown) => fn),
  useMemoMock: vi.fn((factory: () => unknown) => factory()),
  analyzeMutateAsyncMock: vi.fn(),
  storyToScriptRunMock: vi.fn(),
  storyToScriptResetMock: vi.fn(),
  scriptToStoryboardRunMock: vi.fn(),
  scriptToStoryboardResetMock: vi.fn(),
  emitWorkspaceAssistantWorkflowEventMock: vi.fn(),
}))

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return {
    ...actual,
    useState: useStateMock,
    useRef: useRefMock,
    useEffect: useEffectMock,
    useCallback: useCallbackMock,
    useMemo: useMemoMock,
  }
})

vi.mock('@/lib/query/hooks', () => ({
  useAnalyzeProjectAssets: () => ({
    mutateAsync: analyzeMutateAsyncMock,
  }),
  useStoryToScriptRunStream: () => ({
    isRunning: false,
    isRecoveredRunning: false,
    status: 'idle',
    runId: null,
    run: storyToScriptRunMock,
    reset: storyToScriptResetMock,
  }),
  useScriptToStoryboardRunStream: () => ({
    isRunning: false,
    isRecoveredRunning: false,
    status: 'idle',
    runId: null,
    run: scriptToStoryboardRunMock,
    reset: scriptToStoryboardResetMock,
  }),
}))

vi.mock('@/features/project-workspace/components/workspace-assistant/workspace-assistant-events', () => ({
  emitWorkspaceAssistantWorkflowEvent: (...args: unknown[]) => emitWorkspaceAssistantWorkflowEventMock(...args),
}))

import { useWorkspaceAutoRun } from '@/features/project-workspace/hooks/useWorkspaceAutoRun'
import { useWorkspaceAssetLibraryShell } from '@/features/project-workspace/hooks/useWorkspaceAssetLibraryShell'
import {
  buildWorkflowCompletedMessage,
  buildWorkflowErrorMessage,
  buildWorkflowTimelineMessages,
  removeWorkflowStatusParts,
} from '@/features/project-workspace/components/workspace-assistant/workflow-timeline'
import { useWorkspaceExecution } from '@/features/project-workspace/hooks/useWorkspaceExecution'

describe('immediate video submission lock', () => {
  it('regenerating an existing video -> keeps local lock until task state or output changes', () => {
    const panel = {
      panelId: 'panel-1',
      storyboardId: 'storyboard-1',
      panelIndex: 0,
      videoUrl: 'https://example.com/original.mp4',
      videoErrorMessage: null,
      videoTaskRunning: false,
    }
    const baseline = createVideoSubmissionBaseline(panel)

    expect(buildVideoSubmissionKey(panel)).toBe('panel-1')
    expect(
      shouldResolveVideoSubmissionLock(
        {
          ...panel,
          videoTaskRunning: false,
        },
        baseline,
        baseline.startedAt + 1_000,
      ),
    ).toBe(false)
    expect(
      shouldResolveVideoSubmissionLock(
        {
          ...panel,
          videoTaskRunning: true,
        },
        baseline,
        baseline.startedAt + 1_000,
      ),
    ).toBe(true)
    expect(
      shouldResolveVideoSubmissionLock(
        {
          ...panel,
          videoUrl: 'https://example.com/regenerated.mp4',
        },
        baseline,
        baseline.startedAt + 1_000,
      ),
    ).toBe(true)
  })
})

describe('useWorkspaceAutoRun', () => {
  beforeEach(() => {
    useEffectMock.mockReset()
    useRefMock.mockReset()
    useRefMock.mockImplementation((initialValue: unknown) => ({
      current: initialValue,
    }))
  })

  it('consumes autoRun=storyToScript and starts the story-to-script flow once', async () => {
    const effectCallbacks: Array<() => void | (() => void)> = []
    const router = { replace: vi.fn() }
    const runWithRebuildConfirm = vi.fn(async () => undefined)
    const runStoryToScriptFlow = vi.fn(async () => undefined)

    useEffectMock.mockImplementation((callback: () => void | (() => void)) => {
      effectCallbacks.push(callback)
    })

    useWorkspaceAutoRun({
      searchParams: new URLSearchParams('episode=episode-1&autoRun=storyToScript'),
      router,
      episodeId: 'episode-1',
      novelText: '第一章内容',
      isTransitioning: false,
      isStoryToScriptRunning: false,
      runWithRebuildConfirm,
      runStoryToScriptFlow,
    })

    effectCallbacks[0]?.()

    expect(router.replace).toHaveBeenCalledWith('?episode=episode-1', { scroll: false })
    expect(runWithRebuildConfirm).toHaveBeenCalledWith('storyToScript', runStoryToScriptFlow)
  })

  it('does not auto-run when the episode text is still empty', () => {
    const effectCallbacks: Array<() => void | (() => void)> = []
    const router = { replace: vi.fn() }
    const runWithRebuildConfirm = vi.fn(async () => undefined)
    const runStoryToScriptFlow = vi.fn(async () => undefined)

    useEffectMock.mockImplementation((callback: () => void | (() => void)) => {
      effectCallbacks.push(callback)
    })

    useWorkspaceAutoRun({
      searchParams: new URLSearchParams('episode=episode-1&autoRun=storyToScript'),
      router,
      episodeId: 'episode-1',
      novelText: '   ',
      isTransitioning: false,
      isStoryToScriptRunning: false,
      runWithRebuildConfirm,
      runStoryToScriptFlow,
    })

    effectCallbacks[0]?.()

    expect(router.replace).not.toHaveBeenCalled()
    expect(runWithRebuildConfirm).not.toHaveBeenCalled()
  })
})

describe('useWorkspaceAssetLibraryShell', () => {
  beforeEach(() => {
    useStateMock.mockReset()
    useRefMock.mockReset()
    useEffectMock.mockReset()
    useCallbackMock.mockClear()

    useStateMock.mockImplementation((initialValue: unknown) => [initialValue, vi.fn()])
    useRefMock.mockImplementation((initialValue: unknown) => ({
      current: initialValue,
    }))
  })

  it('refreshes assets for the single node canvas workspace', () => {
    const effectCallbacks: Array<() => void | (() => void)> = []
    const router = { replace: vi.fn() }
    const onRefresh = vi.fn(async () => undefined)

    useEffectMock.mockImplementation((callback: () => void | (() => void)) => {
      effectCallbacks.push(callback)
    })

    useWorkspaceAssetLibraryShell({
      searchParams: new URLSearchParams('episode=episode-1'),
      router,
      onRefresh,
    })

    effectCallbacks[1]?.()

    expect(onRefresh).toHaveBeenCalledWith({ scope: 'assets' })
  })
})

describe('useWorkspaceExecution', () => {
  beforeEach(() => {
    useStateMock.mockReset()
    useRefMock.mockClear()
    useEffectMock.mockReset()
    useCallbackMock.mockClear()
    useMemoMock.mockClear()
    analyzeMutateAsyncMock.mockReset()
    storyToScriptRunMock.mockReset()
    storyToScriptResetMock.mockReset()
    scriptToStoryboardRunMock.mockReset()
    scriptToStoryboardResetMock.mockReset()
    emitWorkspaceAssistantWorkflowEventMock.mockReset()

    useStateMock.mockImplementation((initialValue: unknown) => [initialValue, vi.fn()])
    useEffectMock.mockImplementation(() => undefined)
  })

  it('story-to-script submits directly without writing legacy mode fields', async () => {
    const onRefresh = vi.fn(async () => undefined)
    const onOpenAssetLibrary = vi.fn()

    storyToScriptRunMock.mockResolvedValueOnce({
      status: 'completed',
      runId: 'run-story-1',
    })

    const execution = useWorkspaceExecution({
      projectId: 'project-1',
      episodeId: 'episode-1',
      analysisModel: 'provider::analysis-model',
      novelText: '第一章内容',
      t: (key: string) => key,
      onRefresh,
      onOpenAssetLibrary,
    })

    await execution.runStoryToScriptFlow()

    expect(storyToScriptRunMock).toHaveBeenCalledWith({
      episodeId: 'episode-1',
      content: '第一章内容',
      model: 'provider::analysis-model',
      temperature: 0.7,
      reasoning: true,
    })
    expect(emitWorkspaceAssistantWorkflowEventMock).toHaveBeenCalledTimes(1)
    expect(emitWorkspaceAssistantWorkflowEventMock).toHaveBeenCalledWith({
      status: 'completed',
      workflowId: 'story-to-script',
      runId: 'run-story-1',
    })
    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(onOpenAssetLibrary).toHaveBeenCalledTimes(1)
  })
})

describe('workspace assistant workflow timeline messages', () => {
  it('renders gui workflow progress with explicit system wording while staying assistant-compatible', () => {
    const startedMessages = buildWorkflowTimelineMessages('story-to-script', 'run-1')
    const completedMessage = buildWorkflowCompletedMessage('story-to-script', 'run-1')
    const failedMessage = buildWorkflowErrorMessage({
      status: 'failed',
      workflowId: 'story-to-script',
      runId: 'run-1',
      errorMessage: '启动失败',
    })

    expect(startedMessages).toHaveLength(1)
    expect(startedMessages[0]?.role).toBe('assistant')
    expect(completedMessage.role).toBe('assistant')
    expect(failedMessage.role).toBe('assistant')
    expect(startedMessages[0]?.parts[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining('系统已开始执行'),
    })
  })

  it('removes stale workflow status parts before appending the latest workflow state', () => {
    const startedMessages = buildWorkflowTimelineMessages('script-to-storyboard', 'run-1')
    const sanitizedMessages = removeWorkflowStatusParts(startedMessages, 'script-to-storyboard')

    expect(startedMessages[0]?.parts.some((part) => part.type === 'data-workflow-status')).toBe(true)
    expect(sanitizedMessages[0]?.parts.some((part) => part.type === 'data-workflow-status')).toBe(false)
    expect(sanitizedMessages[0]?.parts.some((part) => part.type === 'data-workflow-plan')).toBe(true)
  })
})
