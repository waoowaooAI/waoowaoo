import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CHARACTER_PROMPT_SUFFIX } from '@/lib/constants'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

const workersUtilsMock = vi.hoisted(() => ({
  assertTaskActive: vi.fn(async () => {}),
  getUserModels: vi.fn(async () => ({
    characterModel: 'character-model-1',
    locationModel: 'location-model-1',
  })),
}))

const prismaMock = vi.hoisted(() => ({
  globalCharacter: {
    findFirst: vi.fn(),
  },
  globalCharacterAppearance: {
    update: vi.fn(async () => ({})),
  },
  globalLocation: {
    findFirst: vi.fn(),
  },
  globalLocationImage: {
    update: vi.fn(async () => ({})),
  },
}))

const sharedMock = vi.hoisted(() => ({
  generateLabeledImageToCos: vi.fn(async () => 'cos/generated-character.png'),
  parseJsonStringArray: vi.fn(() => []),
}))

vi.mock('@/lib/workers/utils', () => workersUtilsMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/workers/handlers/image-task-handler-shared', async () => {
  const actual = await vi.importActual<typeof import('@/lib/workers/handlers/image-task-handler-shared')>(
    '@/lib/workers/handlers/image-task-handler-shared',
  )
  return {
    ...actual,
    generateLabeledImageToCos: sharedMock.generateLabeledImageToCos,
    parseJsonStringArray: sharedMock.parseJsonStringArray,
  }
})

import { handleAssetHubImageTask } from '@/lib/workers/handlers/asset-hub-image-task-handler'

function buildJob(payload: Record<string, unknown>): Job<TaskJobData> {
  return {
    data: {
      taskId: 'task-asset-hub-image-1',
      type: TASK_TYPE.ASSET_HUB_IMAGE,
      locale: 'zh',
      projectId: 'project-1',
      targetType: 'GlobalCharacter',
      targetId: 'global-character-1',
      payload,
      userId: 'user-1',
    },
  } as unknown as Job<TaskJobData>
}

function countOccurrences(input: string, target: string) {
  if (!target) return 0
  return input.split(target).length - 1
}

describe('asset hub character image prompt suffix regression', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.globalCharacter.findFirst.mockResolvedValue({
      id: 'global-character-1',
      name: 'Hero',
      appearances: [
        {
          id: 'appearance-1',
          appearanceIndex: 0,
          changeReason: 'base',
          description: '主角，黑发，冷静',
          descriptions: null,
        },
      ],
    })
  })

  it('keeps character prompt suffix in actual generation prompt', async () => {
    const job = buildJob({
      type: 'character',
      id: 'global-character-1',
      appearanceIndex: 0,
    })

    await handleAssetHubImageTask(job)

    const callArg = sharedMock.generateLabeledImageToCos.mock.calls[0]?.[0] as { prompt?: string } | undefined
    const prompt = callArg?.prompt || ''

    expect(prompt).toContain('主角，黑发，冷静')
    expect(prompt).toContain(CHARACTER_PROMPT_SUFFIX)
    expect(countOccurrences(prompt, CHARACTER_PROMPT_SUFFIX)).toBe(1)
  })
})
