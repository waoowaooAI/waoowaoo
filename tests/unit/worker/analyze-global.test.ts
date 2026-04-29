import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

const prismaMock = vi.hoisted(() => ({
  project: { findUnique: vi.fn() },
  userPreference: { findUnique: vi.fn() },
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
  safeParsePropsResponse: vi.fn(() => ({ props: [] })),
}))

const persistMock = vi.hoisted(() => ({
  createAnalyzeGlobalStats: vi.fn((totalChunks: number) => ({
    totalChunks,
    processedChunks: 0,
    newCharacters: 0,
    updatedCharacters: 0,
    newLocations: 0,
    newProps: 0,
    skippedCharacters: 0,
    skippedLocations: 0,
    skippedProps: 0,
  })),
  persistAnalyzeGlobalChunk: vi.fn(async (args: { stats: { newCharacters: number; newLocations: number; newProps: number } }) => {
    args.stats.newCharacters += 1
    args.stats.newLocations += 1
    args.stats.newProps += 1
    return { createdCharacters: [{ id: `char-new-${args.stats.newCharacters}` }] }
  }),
}))

const visualProfileMock = vi.hoisted(() => ({
  generateCreatedCharacterVisualProfile: vi.fn(async () => ({
    success: true,
  })),
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/ai-exec/llm-helpers', () => llmMock)
vi.mock('@/lib/ai-exec/engine', () => ({
  executeAiTextStep: vi.fn(async () => ({
    text: llmMock.getCompletionContent(),
    reasoning: '',
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    completion: { id: 'completion-1' },
  })),
}))
vi.mock('@/lib/llm-observe/internal-stream-context', () => ({
  getInternalLLMStreamCallbacks: vi.fn(() => null),
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
  safeParsePropsResponse: parseMock.safeParsePropsResponse,
}))
vi.mock('@/lib/workers/handlers/analyze-global-prompt', () => ({
  loadAnalyzeGlobalPromptTemplates: vi.fn(() => ({ characterTemplate: 'c', locationTemplate: 'l', propTemplate: 'p' })),
  buildAnalyzeGlobalPrompts: vi.fn(() => ({
    characterPrompt: 'character prompt',
    locationPrompt: 'location prompt',
    propPrompt: 'prop prompt',
  })),
}))
vi.mock('@/lib/workers/handlers/analyze-global-persist', () => ({
  createAnalyzeGlobalStats: persistMock.createAnalyzeGlobalStats,
  persistAnalyzeGlobalChunk: persistMock.persistAnalyzeGlobalChunk,
}))
vi.mock('@/lib/workers/handlers/character-visual-profile', () => visualProfileMock)

import { handleAnalyzeGlobalTask } from '@/lib/workers/handlers/analyze-global'

function buildJob(): Job<TaskJobData> {
  return {
    data: {
      taskId: 'task-analyze-global-1',
      type: TASK_TYPE.ANALYZE_GLOBAL,
      locale: 'zh',
      projectId: 'project-1',
      episodeId: null,
      targetType: 'Project',
      targetId: 'project-1',
      payload: {},
      userId: 'user-1',
    },
  } as unknown as Job<TaskJobData>
}

describe('worker analyze-global behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    prismaMock.project.findUnique.mockResolvedValue({
      id: 'project-1',
      analysisModel: 'llm::analysis-1',
      globalAssetText: '全局设定',
      characters: [{ id: 'char-1', name: 'Hero', aliases: null, introduction: 'hero intro' }],
      locations: [{ id: 'loc-1', name: 'Old Town', summary: 'old town summary', assetKind: 'location' }],
      episodes: [{ id: 'ep-1', name: '第一集', novelText: 'episode text' }],
    })
  })

  it('no analyzable content -> explicit error', async () => {
    const emptyProject = {
      id: 'project-1',
      analysisModel: 'llm::analysis-1',
      globalAssetText: '',
      characters: [],
      locations: [],
      episodes: [{ id: 'ep-1', name: '第一集', novelText: '' }],
    }
    prismaMock.project.findUnique.mockResolvedValue(emptyProject)

    await expect(handleAnalyzeGlobalTask(buildJob())).rejects.toThrow('没有可分析的内容')
  })

  it('success path -> persists every chunk and returns stats summary', async () => {
    const result = await handleAnalyzeGlobalTask(buildJob())

    expect(parseMock.chunkContent).toHaveBeenCalled()
    expect(persistMock.persistAnalyzeGlobalChunk).toHaveBeenCalledTimes(2)
    expect(visualProfileMock.generateCreatedCharacterVisualProfile).toHaveBeenCalledTimes(2)
    expect(visualProfileMock.generateCreatedCharacterVisualProfile).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ data: expect.objectContaining({ projectId: 'project-1' }) }),
      'char-new-1',
      { suppressProgress: true },
    )

    expect(result).toEqual({
      success: true,
      stats: {
        totalChunks: 2,
        newCharacters: 2,
        updatedCharacters: 0,
        newLocations: 2,
        newProps: 2,
        skippedCharacters: 0,
        skippedLocations: 0,
        skippedProps: 0,
        totalCharacters: 1,
        totalLocations: 1,
        totalProps: 0,
      },
    })
  })
})
