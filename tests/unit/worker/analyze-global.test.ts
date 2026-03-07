import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

const prismaMock = vi.hoisted(() => ({
  project: { findUnique: vi.fn() },
  novelPromotionProject: { findUnique: vi.fn() },
}))

const llmMock = vi.hoisted(() => ({
  chatCompletion: vi.fn(async () => ({ id: 'completion-1' })),
  getCompletionContent: vi.fn(() => '{"ok":true}'),
}))

const workerMock = vi.hoisted(() => ({
  reportTaskProgress: vi.fn(async () => undefined),
  assertTaskActive: vi.fn(async () => undefined),
}))

const parseMock = vi.hoisted(() => ({
  chunkContent: vi.fn(() => ['chunk-1', 'chunk-2']),
  safeParseCharactersResponse: vi.fn(() => ({ new_characters: [] })),
  safeParseLocationsResponse: vi.fn(() => ({ locations: [] })),
}))

const persistMock = vi.hoisted(() => ({
  createAnalyzeGlobalStats: vi.fn((totalChunks: number) => ({
    totalChunks,
    processedChunks: 0,
    newCharacters: 0,
    updatedCharacters: 0,
    newLocations: 0,
    skippedCharacters: 0,
    skippedLocations: 0,
  })),
  persistAnalyzeGlobalChunk: vi.fn(async (args: { stats: { newCharacters: number; newLocations: number } }) => {
    args.stats.newCharacters += 1
    args.stats.newLocations += 1
  }),
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/llm-client', () => llmMock)
vi.mock('@/lib/llm-observe/internal-stream-context', () => ({
  withInternalLLMStreamCallbacks: vi.fn(async (_callbacks: unknown, fn: () => Promise<unknown>) => await fn()),
}))
vi.mock('@/lib/workers/shared', () => ({ reportTaskProgress: workerMock.reportTaskProgress }))
vi.mock('@/lib/workers/utils', () => ({ assertTaskActive: workerMock.assertTaskActive }))
vi.mock('@/lib/workers/handlers/llm-stream', () => ({
  createWorkerLLMStreamContext: vi.fn(() => ({ streamRunId: 'run-1', nextSeqByStepLane: {} })),
  createWorkerLLMStreamCallbacks: vi.fn(() => ({
    onStage: vi.fn(),
    onChunk: vi.fn(),
    onComplete: vi.fn(),
    onError: vi.fn(),
    flush: vi.fn(async () => undefined),
  })),
}))
vi.mock('@/lib/workers/handlers/analyze-global-parse', () => ({
  CHUNK_SIZE: 3000,
  chunkContent: parseMock.chunkContent,
  parseAliases: vi.fn(() => []),
  readText: (value: unknown) => (typeof value === 'string' ? value : ''),
  safeParseCharactersResponse: parseMock.safeParseCharactersResponse,
  safeParseLocationsResponse: parseMock.safeParseLocationsResponse,
}))
vi.mock('@/lib/workers/handlers/analyze-global-prompt', () => ({
  loadAnalyzeGlobalPromptTemplates: vi.fn(() => ({ characterTemplate: 'c', locationTemplate: 'l' })),
  buildAnalyzeGlobalPrompts: vi.fn(() => ({
    characterPrompt: 'character prompt',
    locationPrompt: 'location prompt',
  })),
}))
vi.mock('@/lib/workers/handlers/analyze-global-persist', () => ({
  createAnalyzeGlobalStats: persistMock.createAnalyzeGlobalStats,
  persistAnalyzeGlobalChunk: persistMock.persistAnalyzeGlobalChunk,
}))

import { handleAnalyzeGlobalTask } from '@/lib/workers/handlers/analyze-global'

function buildJob(): Job<TaskJobData> {
  return {
    data: {
      taskId: 'task-analyze-global-1',
      type: TASK_TYPE.ANALYZE_GLOBAL,
      locale: 'zh',
      projectId: 'project-1',
      episodeId: null,
      targetType: 'NovelPromotionProject',
      targetId: 'np-project-1',
      payload: {},
      userId: 'user-1',
    },
  } as unknown as Job<TaskJobData>
}

describe('worker analyze-global behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    prismaMock.project.findUnique.mockResolvedValue({ id: 'project-1', mode: 'novel-promotion' })

    prismaMock.novelPromotionProject.findUnique.mockResolvedValue({
      id: 'np-project-1',
      analysisModel: 'llm::analysis-1',
      globalAssetText: '全局设定',
      characters: [{ id: 'char-1', name: 'Hero', aliases: null, introduction: 'hero intro' }],
      locations: [{ id: 'loc-1', name: 'Old Town', summary: 'old town summary' }],
      episodes: [{ id: 'ep-1', name: '第一集', novelText: 'episode text' }],
    })
  })

  it('no analyzable content -> explicit error', async () => {
    prismaMock.novelPromotionProject.findUnique.mockResolvedValueOnce({
      id: 'np-project-1',
      analysisModel: 'llm::analysis-1',
      globalAssetText: '',
      characters: [],
      locations: [],
      episodes: [{ id: 'ep-1', name: '第一集', novelText: '' }],
    })

    await expect(handleAnalyzeGlobalTask(buildJob())).rejects.toThrow('没有可分析的内容')
  })

  it('success path -> persists every chunk and returns stats summary', async () => {
    const result = await handleAnalyzeGlobalTask(buildJob())

    expect(parseMock.chunkContent).toHaveBeenCalled()
    expect(persistMock.persistAnalyzeGlobalChunk).toHaveBeenCalledTimes(2)

    expect(result).toEqual({
      success: true,
      stats: {
        totalChunks: 2,
        newCharacters: 2,
        updatedCharacters: 0,
        newLocations: 2,
        skippedCharacters: 0,
        skippedLocations: 0,
        totalCharacters: 1,
        totalLocations: 1,
      },
    })
  })
})
