import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

const prismaMock = vi.hoisted(() => ({
  project: {
    findUnique: vi.fn(),
  },
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
  normalizeReferenceImageItemsForGeneration: vi.fn(async (
    items: Array<{ url: string; role: string; name: string; appearance?: string | null; slot?: string | null }>,
  ) => ({
    referenceImages: items.map((item) => `normalized:${item.url}`),
    referenceImagesMap: items.map((item, index) => ({
      image_no: `图 ${index + 1}`,
      role: item.role,
      name: item.role === 'source_panel' ? '原始镜头' : item.name,
      ...(item.appearance ? { appearance: item.appearance } : {}),
      ...(item.slot ? { slot: item.slot } : {}),
    })),
  })),
  resolveNovelData: vi.fn(async () => ({
    videoRatio: '16:9',
    directorStyleDoc: {
      character: { temperament: '角色气质', expression: '表情', pose: '姿态', wardrobeTexture: '服装材质', cameraDistance: '中近景', imagePrompt: 'character image style', avoid: '避免夸张' },
      location: { spaceMood: '场景气质', composition: '构图', lightSource: '光源', materials: '材质', colorTemperature: '冷色', depth: '纵深', imagePrompt: 'location image style', avoid: '避免脏乱' },
      prop: { shapeLanguage: '形体', materialAging: '旧化', placement: '摆放', scale: '尺度', lighting: '侧光', imagePrompt: 'prop image style', avoid: '避免超自然' },
      storyboardPlan: { shotSelection: '镜头选择', revealOrder: '揭示顺序', subjectContinuity: '主体连续', sceneCoverage: '场景覆盖', avoid: '避免不可读' },
      cinematography: { shotSize: '景别', lens: '35mm', angle: '平视', cameraHeight: '人眼高度', depthOfField: '中等景深', composition: '偏边构图', lighting: '低照度', avoid: '避免平光' },
      acting: { expression: '克制表情', gaze: '视线回避', posture: '防备姿态', gesture: '手部迟疑', motionState: '慢动作', interactionDistance: '保持距离', avoid: '避免夸张' },
      storyboardDetail: { frameComposition: '画框构图', cameraMovement: '慢推', focalPoint: '视觉焦点', foregroundBackground: '前景遮挡', transitionCue: '声音转场', imagePrompt: 'storyboard detail style', avoid: '避免堆信息' },
      image: { prompt: '图片风格', negativePrompt: '不要平光', lighting: '低照度', color: '冷色', composition: '偏边', texture: '颗粒', atmosphere: '压迫' },
      video: { cameraMotion: '慢推', motionSpeed: '缓慢', subjectMotion: '克制', rhythm: '停顿', stability: '稳定', transition: '暗部转场', avoid: '避免甩镜' },
    },
    characters: [{
      id: 'char-hero',
      name: 'Hero',
      introduction: '主角',
      appearances: [{
        id: 'app-hero-default',
        appearanceIndex: 0,
        changeReason: 'default',
        imageUrls: JSON.stringify(['cos/hero-default.png']),
        imageUrl: 'cos/hero-default.png',
      }],
    }],
    locations: [{
      name: 'Old Town',
      images: [{
        isSelected: true,
        imageUrl: 'cos/old-town.png',
        description: '老街中央留出明确人物站位',
        availableSlots: JSON.stringify([
          '街道左侧靠墙的留白位置',
        ]),
      }],
    }],
  })),
}))

const promptMock = vi.hoisted(() => ({
  buildPrompt: vi.fn(() => 'panel-variant-prompt'),
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/workers/utils', () => utilsMock)
vi.mock('@/lib/logging/core', () => ({
  logInfo: vi.fn(),
  createScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    event: vi.fn(),
    child: vi.fn(),
  })),
}))
vi.mock('@/lib/workers/handlers/image-task-handler-shared', async () => {
  const actual = await vi.importActual<typeof import('@/lib/workers/handlers/image-task-handler-shared')>(
    '@/lib/workers/handlers/image-task-handler-shared',
  )
  return {
    ...actual,
    normalizeReferenceImageItemsForGeneration: sharedMock.normalizeReferenceImageItemsForGeneration,
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

    prismaMock.project.findUnique.mockResolvedValue({
      visualStylePresetSource: 'system',
      visualStylePresetId: 'realistic',
      artStyle: 'realistic',
    })

    prismaMock.projectPanel.findUnique.mockImplementation(async (args: { where: { id: string } }) => {
      if (args.where.id === 'panel-new') {
        return {
          id: 'panel-new',
          storyboardId: 'storyboard-1',
          imageUrl: null,
          location: 'Old Town',
          characters: JSON.stringify([{
            characterId: 'char-hero',
            name: 'Hero',
            appearanceId: 'app-hero-default',
            appearance: 'default',
            slot: '街道左侧靠墙的留白位置',
          }]),
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
          characters: JSON.stringify([{ characterId: 'char-hero', name: 'Hero', appearanceId: 'app-hero-default', appearance: 'default' }]),
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
            'normalized:https://signed.example/cos/old-town.png',
          ],
        }),
      }),
    )
    expect(sharedMock.normalizeReferenceImageItemsForGeneration).toHaveBeenCalledWith(
      [
        expect.objectContaining({ role: 'source_panel', name: 'source panel' }),
        expect.objectContaining({ role: 'character', name: 'Hero', appearance: 'default' }),
        expect.objectContaining({ role: 'location', name: 'Old Town' }),
      ],
      expect.objectContaining({ locale: 'zh' }),
    )

    expect(prismaMock.projectPanel.update).toHaveBeenCalledWith({
      where: { id: 'panel-new' },
      data: { imageUrl: 'cos/panel-variant-new.png' },
    })
    expect(promptMock.buildPrompt).toHaveBeenCalledWith(expect.objectContaining({
      variables: expect.objectContaining({
        characters_info: expect.stringContaining('固定位置：街道左侧靠墙的留白位置'),
        location_asset: expect.stringContaining('街道左侧靠墙的留白位置'),
        reference_images: expect.stringContaining('图 1 = 原始镜头「原始镜头」'),
      }),
    }))
    expect(promptMock.buildPrompt).toHaveBeenCalledWith(expect.objectContaining({
      variables: expect.objectContaining({
        reference_images: expect.stringContaining('图 2 = 角色「Hero」，形象「default」'),
      }),
    }))
    expect(promptMock.buildPrompt).toHaveBeenCalledWith(expect.objectContaining({
      variables: expect.objectContaining({
        reference_images: expect.stringContaining('图 3 = 场景「Old Town」'),
      }),
    }))
    expect(promptMock.buildPrompt).toHaveBeenCalledWith(expect.objectContaining({
      directorStyleDoc: expect.objectContaining({
        image: expect.objectContaining({
          prompt: '图片风格',
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

    expect(sharedMock.normalizeReferenceImageItemsForGeneration).toHaveBeenCalledWith(
      [expect.objectContaining({ role: 'source_panel' })],
      expect.objectContaining({
        context: expect.objectContaining({ scope: 'panel-variant.refs' }),
      }),
    )
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
