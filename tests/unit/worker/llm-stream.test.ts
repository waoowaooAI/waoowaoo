import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Job } from 'bullmq'
import type { TaskJobData } from '@/lib/task/types'

const reportTaskProgressMock = vi.hoisted(() => vi.fn(async () => undefined))
const reportTaskStreamChunkMock = vi.hoisted(() => vi.fn(async () => undefined))
const assertTaskActiveMock = vi.hoisted(() => vi.fn(async () => undefined))
const isTaskActiveMock = vi.hoisted(() => vi.fn(async () => true))

vi.mock('@/lib/workers/shared', () => ({
  reportTaskProgress: reportTaskProgressMock,
  reportTaskStreamChunk: reportTaskStreamChunkMock,
}))

vi.mock('@/lib/workers/utils', () => ({
  assertTaskActive: assertTaskActiveMock,
}))

vi.mock('@/lib/task/service', () => ({
  isTaskActive: isTaskActiveMock,
}))

import { createWorkerLLMStreamCallbacks, createWorkerLLMStreamContext } from '@/lib/workers/handlers/llm-stream'

function buildJob(): Job<TaskJobData> {
  const data: TaskJobData = {
    taskId: 'task-1',
    type: 'story_to_script_run',
    locale: 'zh',
    projectId: 'project-1',
    userId: 'user-1',
    targetType: 'NovelPromotionEpisode',
    targetId: 'episode-1',
    payload: {},
    trace: null,
  }
  return {
    data,
  } as unknown as Job<TaskJobData>
}

describe('createWorkerLLMStreamCallbacks', () => {
  beforeEach(() => {
    reportTaskProgressMock.mockReset()
    reportTaskStreamChunkMock.mockReset()
    assertTaskActiveMock.mockReset()
    isTaskActiveMock.mockReset()
    isTaskActiveMock.mockResolvedValue(true)
  })

  it('publishes final step output on onComplete for replay recovery', async () => {
    const job = buildJob()
    const context = createWorkerLLMStreamContext(job, 'story_to_script')
    const callbacks = createWorkerLLMStreamCallbacks(job, context)

    callbacks.onStage({
      stage: 'streaming',
      provider: 'ark',
      step: {
        id: 'screenplay_clip_1',
        attempt: 2,
        title: 'progress.streamStep.screenplayConversion',
        index: 1,
        total: 1,
      },
    })
    callbacks.onComplete('final screenplay text', {
      id: 'screenplay_clip_1',
      attempt: 2,
      title: 'progress.streamStep.screenplayConversion',
      index: 1,
      total: 1,
    })
    await callbacks.flush()

    const finalProgressCall = reportTaskProgressMock.mock.calls.find((call) => {
      const payload = call[2] as Record<string, unknown> | undefined
      return payload?.stage === 'worker_llm_complete'
    })

    expect(finalProgressCall).toBeDefined()
    const payload = finalProgressCall?.[2] as Record<string, unknown>
    expect(payload.done).toBe(true)
    expect(payload.output).toBe('final screenplay text')
    expect(payload.stepId).toBe('screenplay_clip_1')
    expect(payload.stepAttempt).toBe(2)
    expect(payload.stepTitle).toBe('progress.streamStep.screenplayConversion')
    expect(payload.stepIndex).toBe(1)
    expect(payload.stepTotal).toBe(1)
  })

  it('keeps completion payload bound to provided step under interleaved steps', async () => {
    const job = buildJob()
    const context = createWorkerLLMStreamContext(job, 'story_to_script')
    const callbacks = createWorkerLLMStreamCallbacks(job, context)

    callbacks.onChunk({
      kind: 'text',
      delta: 'A-',
      seq: 1,
      lane: 'main',
      step: { id: 'analyze_characters', attempt: 1, title: 'A', index: 1, total: 2 },
    })
    callbacks.onChunk({
      kind: 'text',
      delta: 'B-',
      seq: 1,
      lane: 'main',
      step: { id: 'analyze_locations', attempt: 1, title: 'B', index: 2, total: 2 },
    })
    callbacks.onComplete('characters-final', {
      id: 'analyze_characters',
      attempt: 1,
      title: 'A',
      index: 1,
      total: 2,
    })
    await callbacks.flush()

    const finalProgressCall = reportTaskProgressMock.mock.calls.find((call) => {
      const payload = call[2] as Record<string, unknown> | undefined
      return payload?.stage === 'worker_llm_complete'
    })

    expect(finalProgressCall).toBeDefined()
    const payload = finalProgressCall?.[2] as Record<string, unknown>
    expect(payload.stepId).toBe('analyze_characters')
    expect(payload.stepTitle).toBe('A')
    expect(payload.output).toBe('characters-final')
  })
})
