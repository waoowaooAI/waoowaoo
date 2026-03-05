import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

const prismaMock = vi.hoisted(() => ({
  segment: {
    findMany: vi.fn(),
  },
  character: {
    upsert: vi.fn(async () => ({})),
  },
  location: {
    upsert: vi.fn(async () => ({})),
  },
  prop: {
    upsert: vi.fn(async () => ({})),
  },
}))

const workerMock = vi.hoisted(() => ({
  reportTaskProgress: vi.fn(async () => undefined),
  assertTaskActive: vi.fn(async () => undefined),
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/workers/shared', () => ({ reportTaskProgress: workerMock.reportTaskProgress }))
vi.mock('@/lib/workers/utils', () => ({ assertTaskActive: workerMock.assertTaskActive }))

import { handleExtractAssetsTask } from '@/lib/workers/handlers/extract-assets'

function buildJob(type: TaskJobData['type'], payload: Record<string, unknown>): Job<TaskJobData> {
  return {
    data: {
      taskId: 'task-extract-1',
      type,
      locale: 'zh',
      projectId: 'project-1',
      targetType: 'project',
      targetId: 'project-1',
      payload,
      userId: 'user-1',
    },
  } as unknown as Job<TaskJobData>
}

describe('worker extract-assets behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.segment.findMany.mockResolvedValue([
      {
        id: 'seg-1',
        summary: '第一段',
        content: '[@徐凤年] 与王仙芝对峙',
        location: '听潮亭',
        characters: [{ name: '王仙芝', aliases: ['老王'] }],
        props: ['桃木剑'],
      },
      {
        id: 'seg-2',
        summary: '第二段',
        content: '王仙芝反击',
        location: '听潮亭',
        characters: ['王仙芝/王老怪'],
        props: [{ name: '桃木剑' }, { name: '麻衣' }],
      },
    ])
  })

  it('extracts characters with alias merge and source segment refs', async () => {
    const result = await handleExtractAssetsTask(buildJob(
      TASK_TYPE.EXTRACT_CHARACTERS_LLM,
      {
        extractType: 'characters',
        context: '补充角色 [@徐凤年]',
      },
    ))

    expect(result.success).toBe(true)
    expect(result.extractType).toBe('characters')
    expect(result.dedupe.inputCount).toBeGreaterThan(2)
    expect(result.dedupe.outputCount).toBe(2)
    const wang = result.items.find((item) => item.name === '王仙芝')
    expect(wang?.aliases).toEqual(expect.arrayContaining(['老王', '王老怪']))
    expect(wang?.sourceSegmentIds).toEqual(expect.arrayContaining(['seg-1', 'seg-2']))
    expect(prismaMock.character.upsert).toHaveBeenCalledTimes(2)
  })

  it('extracts locations with dedupe and persists once per canonical name', async () => {
    const result = await handleExtractAssetsTask(buildJob(
      TASK_TYPE.EXTRACT_LOCATIONS_LLM,
      {
        extractType: 'locations',
        context: '忽略',
      },
    ))

    expect(result.success).toBe(true)
    expect(result.extractType).toBe('locations')
    expect(result.dedupe.outputCount).toBe(1)
    expect(result.items[0]?.name).toBe('听潮亭')
    expect(result.items[0]?.sourceSegmentIds).toEqual(expect.arrayContaining(['seg-1', 'seg-2']))
    expect(prismaMock.location.upsert).toHaveBeenCalledTimes(1)
  })

  it('extracts props and keeps source traceability', async () => {
    const result = await handleExtractAssetsTask(buildJob(
      TASK_TYPE.EXTRACT_PROPS_LLM,
      {
        extractType: 'props',
        context: '',
      },
    ))

    expect(result.success).toBe(true)
    expect(result.extractType).toBe('props')
    expect(result.dedupe.outputCount).toBe(2)
    expect(result.items.map((item) => item.name)).toEqual(expect.arrayContaining(['桃木剑', '麻衣']))
    expect(prismaMock.prop.upsert).toHaveBeenCalledTimes(2)
  })
})
