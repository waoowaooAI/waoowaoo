import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

type RouteContext = {
  params: Promise<{ runId: string; stepKey: string }>
}

const authState = vi.hoisted(() => ({ authenticated: true }))
const getRunByIdMock = vi.hoisted(() => vi.fn())
const retryFailedStepMock = vi.hoisted(() => vi.fn())
const submitTaskMock = vi.hoisted(() => vi.fn())
const resolveRequiredTaskLocaleMock = vi.hoisted(() => vi.fn(() => 'zh'))

vi.mock('@/lib/api-auth', () => {
  const unauthorized = () => new Response(
    JSON.stringify({ error: { code: 'UNAUTHORIZED' } }),
    { status: 401, headers: { 'content-type': 'application/json' } },
  )

  return {
    isErrorResponse: (value: unknown) => value instanceof Response,
    requireUserAuth: async () => {
      if (!authState.authenticated) return unauthorized()
      return { session: { user: { id: 'user-1' } } }
    },
  }
})

vi.mock('@/lib/run-runtime/service', () => ({
  getRunById: getRunByIdMock,
  retryFailedStep: retryFailedStepMock,
}))

vi.mock('@/lib/task/submitter', () => ({
  submitTask: submitTaskMock,
}))

vi.mock('@/lib/task/resolve-locale', () => ({
  resolveRequiredTaskLocale: resolveRequiredTaskLocaleMock,
}))

describe('api contract - run step retry route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.authenticated = true

    getRunByIdMock.mockResolvedValue({
      id: 'run-1',
      userId: 'user-1',
      projectId: 'project-1',
      episodeId: 'episode-1',
      workflowType: 'story_to_script_run',
      taskType: 'story_to_script_run',
      targetType: 'NovelPromotionEpisode',
      targetId: 'episode-1',
      input: {
        episodeId: 'episode-1',
        content: 'test content',
        meta: { locale: 'zh' },
      },
    })
    retryFailedStepMock.mockResolvedValue({
      run: { id: 'run-1' },
      step: { stepKey: 'screenplay_clip_2' },
      retryAttempt: 2,
    })
    submitTaskMock.mockResolvedValue({
      success: true,
      async: true,
      taskId: 'task-retry-1',
      runId: 'run-1',
      status: 'queued',
      deduped: false,
    })
  })

  it('rejects retry when step is not failed', async () => {
    retryFailedStepMock.mockRejectedValue(new Error('RUN_STEP_NOT_FAILED'))
    const route = await import('@/app/api/runs/[runId]/steps/[stepKey]/retry/route')

    const req = buildMockRequest({
      path: '/api/runs/run-1/steps/screenplay_clip_2/retry',
      method: 'POST',
      body: { modelOverride: 'openai/gpt-5' },
    })
    const res = await route.POST(req, {
      params: Promise.resolve({ runId: 'run-1', stepKey: 'screenplay_clip_2' }),
    } as RouteContext)

    expect(res.status).toBe(400)
    expect(submitTaskMock).not.toHaveBeenCalled()
  })

  it('submits retry task bound to existing run id', async () => {
    const route = await import('@/app/api/runs/[runId]/steps/[stepKey]/retry/route')

    const req = buildMockRequest({
      path: '/api/runs/run-1/steps/screenplay_clip_2/retry',
      method: 'POST',
      body: {
        modelOverride: 'openai/gpt-5',
        reason: 'manual retry',
      },
    })
    const res = await route.POST(req, {
      params: Promise.resolve({ runId: 'run-1', stepKey: 'screenplay_clip_2' }),
    } as RouteContext)

    expect(res.status).toBe(200)
    const payload = await res.json() as {
      success: boolean
      runId: string
      stepKey: string
      retryAttempt: number
      taskId: string
    }
    expect(payload.success).toBe(true)
    expect(payload.runId).toBe('run-1')
    expect(payload.stepKey).toBe('screenplay_clip_2')
    expect(payload.retryAttempt).toBe(2)
    expect(payload.taskId).toBe('task-retry-1')

    expect(submitTaskMock).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      type: 'story_to_script_run',
      payload: expect.objectContaining({
        runId: 'run-1',
        retryStepKey: 'screenplay_clip_2',
        retryStepAttempt: 2,
        model: 'openai/gpt-5',
      }),
    }))
  })
})
