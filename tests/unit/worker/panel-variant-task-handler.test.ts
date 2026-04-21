import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

const prismaMock = vi.hoisted(() => ({
  projectPanel: {
    findUnique: vi.fn(),
    update: vi.fn(async () => ({})),
  },
}))

const utilsMock = vi.hoisted(() => ({
  assertTaskActive: vi.fn(async () => undefined),
  getProjectModels: vi.fn(async () => ({ storyboardModel: 'storyboard-model-1', artStyle: 'realistic' })),
  resolveImageSourceFromGeneration: vi.fn(async () => 'generated-variant-source'),
  toSignedUrlIfCos: vi.fn((url: string | null | undefined) => (url ? `https://signed.example/${url}` : null)),
  uploadImageSourceToCos: vi.fn(async () => 'cos/panel-variant-new.png'),
}))

const sharedMock = vi.hoisted(() => ({
  collectPanelReferenceImages: vi.fn(async () => ['https://signed.example/ref-character.png']),
  resolveNovelData: vi.fn(async () => ({
    videoRatio: '16:9',
    directorStyleDoc: {
      character: { intent: '角色风格', priorities: [], avoid: [], allowWhenHelpful: [], judgement: '按需判断' },
      location: { intent: '场景风格', priorities: [], avoid: [], allowWhenHelpful: [], judgement: '按需判断' },
      prop: { intent: '道具风格', priorities: [], avoid: [], allowWhenHelpful: [], judgement: '按需判断' },
      storyboardPlan: { intent: '分镜风格', priorities: [], avoid: [], allowWhenHelpful: [], judgement: '按需判断' },
      cinematography: { intent: '摄影风格', priorities: [], avoid: [], allowWhenHelpful: [], judgement: '按需判断' },
      acting: { intent: '表演风格', priorities: [], avoid: [], allowWhenHelpful: [], judgement: '按需判断' },
      storyboardDetail: { intent: '细化风格', priorities: [], avoid: [], allowWhenHelpful: [], judgement: '按需判断' },
      image: { intent: '图片风格', priorities: [], avoid: [], allowWhenHelpful: [], judgement: '按需判断' },
      video: { intent: '视频风格', priorities: [], avoid: [], allowWhenHelpful: [], judgement: '按需判断' },
    },
    characters: [{
      name: 'Hero',
      introduction: '主角',
      appearances: [{
        changeReason: 'default',
        imageUrls: JSON.stringify(['cos/hero-default.png']),
        imageUrl: 'cos/hero-default.png',
      }],
    }],
    locations: [{
      name: 'Old Town',
      images: [{
        isSelected: true,
        description: '老街中央留出明确人物站位',
        availableSlots: JSON.stringify([
          '街道左侧靠墙的留白位置',
        ]),
      }],
    }],
  })),
}))

const outboundMock = vi.hoisted(() => ({
  normalizeReferenceImagesForGeneration: vi.fn(async (refs: string[]) => refs.map((item) => `normalized:${item}`)),
}))

const promptMock = vi.hoisted(() => ({
  buildPrompt: vi.fn(() => 'panel-variant-prompt'),
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/workers/utils', () => utilsMock)
vi.mock('@/lib/media/outbound-image', () => outboundMock)
vi.mock('@/lib/logging/core', () => ({ logInfo: vi.fn() }))
vi.mock('@/lib/workers/handlers/image-task-handler-shared', async () => {
  const actual = await vi.importActual<typeof import('@/lib/workers/handlers/image-task-handler-shared')>(
    '@/lib/workers/handlers/image-task-handler-shared',
  )
  return {
    ...actual,
    collectPanelReferenceImages: sharedMock.collectPanelReferenceImages,
    resolveNovelData: sharedMock.resolveNovelData,
  }
})
vi.mock('@/lib/ai-prompts', () => ({
  AI_PROMPT_IDS: { SHOT_VARIANT_GENERATE: 'shot-variant-generate' },
  buildAiPrompt: promptMock.buildPrompt,
}))

import { handlePanelVariantTask } from '@/lib/workers/handlers/panel-variant-task-handler'

function buildJob(
  payload: Record<string, unknown>,
  locale: TaskJobData['locale'] = 'zh',
): Job<TaskJobData> {
  return {
    data: {
      taskId: 'task-panel-variant-1',
      type: TASK_TYPE.PANEL_VARIANT,
      locale,
      projectId: 'project-1',
      episodeId: 'episode-1',
      targetType: 'ProjectPanel',
      targetId: 'panel-new',
      payload,
      userId: 'user-1',
    },
  } as unknown as Job<TaskJobData>
}

describe('worker panel-variant-task-handler behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    prismaMock.projectPanel.findUnique.mockImplementation(async (args: { where: { id: string } }) => {
      if (args.where.id === 'panel-new') {
        return {
          id: 'panel-new',
          storyboardId: 'storyboard-1',
          imageUrl: null,
          location: 'Old Town',
          characters: JSON.stringify([{ name: 'Hero', appearance: 'default', slot: '街道左侧靠墙的留白位置' }]),
        }
      }
      if (args.where.id === 'panel-source') {
        return {
          id: 'panel-source',
          storyboardId: 'storyboard-1',
          imageUrl: 'cos/panel-source.png',
          description: 'source description',
          shotType: 'medium',
          cameraMove: 'pan',
          location: 'Old Town',
          characters: JSON.stringify([{ name: 'Hero' }]),
        }
      }
      return null
    })
  })

  it('missing source/new panel ids -> explicit error', async () => {
    const job = buildJob({})
    await expect(handlePanelVariantTask(job)).rejects.toThrow('panel_variant missing newPanelId/sourcePanelId')
  })

  it('success path -> includes source panel image in referenceImages and persists new image', async () => {
    const payload = {
      newPanelId: 'panel-new',
      sourcePanelId: 'panel-source',
      variant: {
        title: '雨夜版本',
        description: '加强雨夜氛围',
      },
    }

    const result = await handlePanelVariantTask(buildJob(payload))

    expect(utilsMock.resolveImageSourceFromGeneration).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        modelId: 'storyboard-model-1',
        prompt: 'panel-variant-prompt',
        options: expect.objectContaining({
          aspectRatio: '16:9',
          referenceImages: [
            'normalized:https://signed.example/cos/panel-source.png',
            'normalized:https://signed.example/cos/hero-default.png',
          ],
        }),
      }),
    )

    expect(prismaMock.projectPanel.update).toHaveBeenCalledWith({
      where: { id: 'panel-new' },
      data: { imageUrl: 'cos/panel-variant-new.png' },
    })
    expect(promptMock.buildPrompt).toHaveBeenCalledWith(expect.objectContaining({
      variables: expect.objectContaining({
        characters_info: expect.stringContaining('固定位置：街道左侧靠墙的留白位置'),
        location_asset: expect.stringContaining('街道左侧靠墙的留白位置'),
      }),
    }))
    expect(promptMock.buildPrompt).toHaveBeenCalledWith(expect.objectContaining({
      directorStyleDoc: expect.objectContaining({
        image: expect.objectContaining({
          intent: '图片风格',
        }),
      }),
    }))

    expect(result).toEqual({
      panelId: 'panel-new',
      storyboardId: 'storyboard-1',
      imageUrl: 'cos/panel-variant-new.png',
    })
  })

  it('respects reference asset toggles when character/location assets are disabled', async () => {
    const payload = {
      newPanelId: 'panel-new',
      sourcePanelId: 'panel-source',
      includeCharacterAssets: false,
      includeLocationAsset: false,
      variant: {
        title: '禁用资产版本',
        description: '只参考原镜头',
        video_prompt: '只参考原镜头',
      },
    }

    await handlePanelVariantTask(buildJob(payload))

    expect(outboundMock.normalizeReferenceImagesForGeneration).toHaveBeenCalledWith([
      'https://signed.example/cos/panel-source.png',
    ])
    expect(promptMock.buildPrompt).toHaveBeenCalledWith(expect.objectContaining({
      variables: expect.objectContaining({
        character_assets: '未使用角色参考图',
        location_asset: '未使用场景参考图',
      }),
    }))
  })

  it('uses localized slot labels in english variant prompts', async () => {
    const payload = {
      newPanelId: 'panel-new',
      sourcePanelId: 'panel-source',
      variant: {
        title: 'Rainy night version',
        description: 'Keep the same staging but change the mood',
        video_prompt: 'Keep the same staging but change the mood',
      },
    }

    await handlePanelVariantTask(buildJob(payload, 'en'))

    expect(promptMock.buildPrompt).toHaveBeenCalledWith(expect.objectContaining({
      locale: 'en',
      variables: expect.objectContaining({
        location_asset: expect.stringContaining('Available character slots:'),
      }),
    }))
    expect(promptMock.buildPrompt).toHaveBeenCalledWith(expect.objectContaining({
      variables: expect.objectContaining({
        location_asset: expect.not.stringContaining('可站位置：'),
      }),
    }))
  })
})
