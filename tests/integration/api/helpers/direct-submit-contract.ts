import { vi } from 'vitest'
import { TASK_TYPE, type TaskType } from '@/lib/task/types'
import { buildMockRequest } from '../../../helpers/request'

export type SubmitResult = {
  taskId: string
  async: true
}

export type RouteContext = {
  params: Promise<Record<string, string>>
}

export type DirectRouteCase = {
  routeFile: string
  body: Record<string, unknown>
  params?: Record<string, string>
  expectedTaskType: TaskType
  expectedTargetType: string
  expectedProjectId: string
  expectedPayloadSubset?: Record<string, unknown>
}

export const authState = {
  authenticated: true,
}

export const submitTaskMock = vi.fn<(...args: unknown[]) => Promise<SubmitResult>>()

export const configServiceMock = {
  getUserModelConfig: vi.fn(async () => ({
    characterModel: 'img::character',
    locationModel: 'img::location',
    editModel: 'img::edit',
  })),
  buildImageBillingPayloadFromUserConfig: vi.fn((input: { basePayload: Record<string, unknown> }) => ({
    ...input.basePayload,
    generationOptions: { resolution: '1024x1024' },
  })),
  getProjectModelConfig: vi.fn(async () => ({
    characterModel: 'img::character',
    locationModel: 'img::location',
    editModel: 'img::edit',
    storyboardModel: 'img::storyboard',
    analysisModel: 'llm::analysis',
  })),
  buildImageBillingPayload: vi.fn(async (input: { basePayload: Record<string, unknown> }) => ({
    ...input.basePayload,
    generationOptions: { resolution: '1024x1024' },
  })),
  resolveProjectModelCapabilityGenerationOptions: vi.fn(async () => ({
    resolution: '1024x1024',
  })),
}

export const hasOutputMock = {
  hasGlobalCharacterOutput: vi.fn(async () => false),
  hasGlobalLocationOutput: vi.fn(async () => false),
  hasGlobalCharacterAppearanceOutput: vi.fn(async () => false),
  hasGlobalLocationImageOutput: vi.fn(async () => false),
  hasCharacterAppearanceOutput: vi.fn(async () => false),
  hasLocationImageOutput: vi.fn(async () => false),
  hasPanelLipSyncOutput: vi.fn(async () => false),
  hasPanelImageOutput: vi.fn(async () => false),
  hasPanelVideoOutput: vi.fn(async () => false),
  hasVoiceLineAudioOutput: vi.fn(async () => false),
}

export const prismaMock = {
  project: {
    findUnique: vi.fn(async () => ({
      id: 'project-1',
      audioModel: 'fal::audio-model',
      characters: [
        {
          name: 'Narrator',
          customVoiceUrl: 'https://voice.example/narrator.mp3',
          voiceId: 'voice-1',
        },
      ],
    })),
  },
  userPreference: {
    findUnique: vi.fn(async () => ({ lipSyncModel: 'fal::lipsync-model' })),
  },
  projectStoryboard: {
    findUnique: vi.fn(async () => ({
      id: 'storyboard-1',
      episode: {
        projectId: 'project-1',
      },
    })),
    update: vi.fn(async () => ({})),
  },
  projectPanel: {
    findFirst: vi.fn(async () => ({ id: 'panel-1' })),
    findMany: vi.fn(async () => []),
    findUnique: vi.fn(async ({ where }: { where?: { id?: string } }) => {
      const id = where?.id || 'panel-1'
      if (id === 'panel-src') {
        return {
          id,
          storyboardId: 'storyboard-1',
          panelIndex: 1,
          shotType: 'wide',
          cameraMove: 'static',
          description: 'source description',
          videoPrompt: 'source video prompt',
          location: 'source location',
          characters: '[]',
          srtSegment: '',
          duration: 3,
        }
      }
      if (id === 'panel-ins') {
        return {
          id,
          storyboardId: 'storyboard-1',
          panelIndex: 2,
          shotType: 'medium',
          cameraMove: 'push',
          description: 'insert description',
          videoPrompt: 'insert video prompt',
          location: 'insert location',
          characters: '[]',
          srtSegment: '',
          duration: 3,
        }
      }
      return {
        id,
        storyboardId: 'storyboard-1',
        panelIndex: 0,
        shotType: 'medium',
        cameraMove: 'static',
        description: 'panel description',
        videoPrompt: 'panel prompt',
        location: 'panel location',
        characters: '[]',
        srtSegment: '',
        duration: 3,
      }
    }),
    update: vi.fn(async () => ({})),
    create: vi.fn(async () => ({ id: 'panel-created', panelIndex: 3 })),
    findUniqueOrThrow: vi.fn(),
    delete: vi.fn(async () => ({})),
    count: vi.fn(async () => 3),
    updateMany: vi.fn(async () => ({ count: 0 })),
  },
  projectEpisode: {
    findFirst: vi.fn(async () => ({
      id: 'episode-1',
      speakerVoices: '{}',
    })),
  },
  projectVoiceLine: {
    findMany: vi.fn(async () => [
      { id: 'line-1', speaker: 'Narrator', content: 'hello world voice line' },
    ]),
    findFirst: vi.fn(async () => ({
      id: 'line-1',
      speaker: 'Narrator',
      content: 'hello world voice line',
    })),
  },
  $transaction: vi.fn(async (fn: (tx: {
    projectPanel: {
      findMany: (args: unknown) => Promise<Array<{ id: string; panelIndex: number }>>
      update: (args: unknown) => Promise<unknown>
      create: (args: { data?: { id?: string; panelIndex?: number } }) => Promise<{ id: string; panelIndex: number }>
      findFirst: (args: unknown) => Promise<{ panelIndex: number } | null>
      delete: (args: unknown) => Promise<unknown>
      count: (args: unknown) => Promise<number>
      updateMany: (args: unknown) => Promise<{ count: number }>
    }
    projectStoryboard: {
      update: (args: unknown) => Promise<unknown>
    }
  }) => Promise<unknown>) => {
    const tx = {
      projectPanel: {
        findMany: async () => [],
        update: async () => ({}),
        create: async (args: { data?: { id?: string; panelIndex?: number } }) => ({
          id: args.data?.id || 'panel-created',
          panelIndex: args.data?.panelIndex ?? 3,
        }),
        findFirst: async () => ({ panelIndex: 3 }),
        delete: async () => ({}),
        count: async () => 3,
        updateMany: async () => ({ count: 0 }),
      },
      projectStoryboard: {
        update: async () => ({}),
      },
    }
    return await fn(tx)
  }),
}

export function resetDirectSubmitMocks() {
  vi.clearAllMocks()
  authState.authenticated = true
  let seq = 0
  submitTaskMock.mockImplementation(async () => ({
    taskId: `task-${++seq}`,
    async: true,
  }))
}

function toApiPath(routeFile: string, params?: Record<string, string>): string {
  return routeFile
    .replace(/^src\/app/, '')
    .replace(/\/route\.ts$/, '')
    .replace('[projectId]', params?.projectId || 'project-1')
    .replace('[assetId]', params?.assetId || 'asset-1')
}

function toModuleImportPath(routeFile: string): string {
  return `@/${routeFile.replace(/^src\//, '').replace(/\.ts$/, '')}`
}

export async function invokePostRoute(routeCase: DirectRouteCase): Promise<Response> {
  const modulePath = toModuleImportPath(routeCase.routeFile)
  const mod = await import(modulePath)
  const post = mod.POST as (request: Request, context?: RouteContext) => Promise<Response>
  const req = buildMockRequest({
    path: toApiPath(routeCase.routeFile, routeCase.params),
    method: 'POST',
    body: routeCase.body,
  })
  return await post(req, { params: Promise.resolve(routeCase.params || {}) })
}

export const DIRECT_MEDIA_CASES: ReadonlyArray<DirectRouteCase> = [
  {
    routeFile: 'src/app/api/asset-hub/generate-image/route.ts',
    body: { type: 'character', id: 'global-character-1', appearanceIndex: 0, artStyle: 'realistic' },
    expectedTaskType: TASK_TYPE.ASSET_HUB_IMAGE,
    expectedTargetType: 'GlobalCharacter',
    expectedProjectId: 'global-asset-hub',
  },
  {
    routeFile: 'src/app/api/asset-hub/modify-image/route.ts',
    body: {
      type: 'character',
      id: 'global-character-1',
      modifyPrompt: 'sharpen details',
      appearanceIndex: 0,
      imageIndex: 0,
      extraImageUrls: ['https://example.com/ref-a.png'],
    },
    expectedTaskType: TASK_TYPE.ASSET_HUB_MODIFY,
    expectedTargetType: 'GlobalCharacterAppearance',
    expectedProjectId: 'global-asset-hub',
  },
  {
    routeFile: 'src/app/api/assets/[assetId]/generate/route.ts',
    body: {
      scope: 'global',
      kind: 'character',
      appearanceIndex: 0,
      artStyle: 'realistic',
    },
    params: { assetId: 'global-character-1' },
    expectedTaskType: TASK_TYPE.ASSET_HUB_IMAGE,
    expectedTargetType: 'GlobalCharacter',
    expectedProjectId: 'global-asset-hub',
  },
  {
    routeFile: 'src/app/api/assets/[assetId]/generate/route.ts',
    body: {
      scope: 'project',
      kind: 'character',
      projectId: 'project-1',
      appearanceId: 'appearance-1',
    },
    params: { assetId: 'character-1' },
    expectedTaskType: TASK_TYPE.IMAGE_CHARACTER,
    expectedTargetType: 'CharacterAppearance',
    expectedProjectId: 'project-1',
  },
  {
    routeFile: 'src/app/api/assets/[assetId]/modify-render/route.ts',
    body: {
      scope: 'global',
      kind: 'character',
      modifyPrompt: 'sharpen details',
      appearanceIndex: 0,
      imageIndex: 0,
      extraImageUrls: ['https://example.com/ref-a.png'],
    },
    params: { assetId: 'global-character-1' },
    expectedTaskType: TASK_TYPE.ASSET_HUB_MODIFY,
    expectedTargetType: 'GlobalCharacterAppearance',
    expectedProjectId: 'global-asset-hub',
  },
  {
    routeFile: 'src/app/api/assets/[assetId]/modify-render/route.ts',
    body: {
      scope: 'project',
      kind: 'character',
      projectId: 'project-1',
      appearanceId: 'appearance-1',
      modifyPrompt: 'enhance texture',
      extraImageUrls: ['https://example.com/ref-b.png'],
    },
    params: { assetId: 'character-1' },
    expectedTaskType: TASK_TYPE.MODIFY_ASSET_IMAGE,
    expectedTargetType: 'CharacterAppearance',
    expectedProjectId: 'project-1',
  },
  {
    routeFile: 'src/app/api/projects/[projectId]/generate-image/route.ts',
    body: { type: 'character', id: 'character-1', appearanceId: 'appearance-1' },
    params: { projectId: 'project-1' },
    expectedTaskType: TASK_TYPE.IMAGE_CHARACTER,
    expectedTargetType: 'CharacterAppearance',
    expectedProjectId: 'project-1',
  },
  {
    routeFile: 'src/app/api/projects/[projectId]/generate-video/route.ts',
    body: {
      videoModel: 'ark::doubao-seedance-2-0-260128',
      storyboardId: 'storyboard-1',
      panelIndex: 0,
      generationOptions: {
        resolution: '720p',
        duration: 5,
      },
      firstLastFrame: {
        flModel: 'ark::doubao-seedance-2-0-260128',
      },
    },
    params: { projectId: 'project-1' },
    expectedTaskType: TASK_TYPE.VIDEO_PANEL,
    expectedTargetType: 'ProjectPanel',
    expectedProjectId: 'project-1',
    expectedPayloadSubset: {
      videoModel: 'ark::doubao-seedance-2-0-260128',
      generationOptions: {
        resolution: '720p',
        duration: 5,
      },
      firstLastFrame: {
        flModel: 'ark::doubao-seedance-2-0-260128',
      },
    },
  },
  {
    routeFile: 'src/app/api/projects/[projectId]/lip-sync/route.ts',
    body: {
      storyboardId: 'storyboard-1',
      panelIndex: 0,
      voiceLineId: 'line-1',
      lipSyncModel: 'fal::lip-model',
    },
    params: { projectId: 'project-1' },
    expectedTaskType: TASK_TYPE.LIP_SYNC,
    expectedTargetType: 'ProjectPanel',
    expectedProjectId: 'project-1',
  },
  {
    routeFile: 'src/app/api/projects/[projectId]/modify-asset-image/route.ts',
    body: {
      type: 'character',
      characterId: 'character-1',
      appearanceId: 'appearance-1',
      modifyPrompt: 'enhance texture',
      extraImageUrls: ['https://example.com/ref-b.png'],
    },
    params: { projectId: 'project-1' },
    expectedTaskType: TASK_TYPE.MODIFY_ASSET_IMAGE,
    expectedTargetType: 'CharacterAppearance',
    expectedProjectId: 'project-1',
  },
  {
    routeFile: 'src/app/api/projects/[projectId]/modify-storyboard-image/route.ts',
    body: {
      storyboardId: 'storyboard-1',
      panelIndex: 0,
      modifyPrompt: 'increase contrast',
      extraImageUrls: ['https://example.com/ref-c.png'],
      selectedAssets: [{ imageUrl: 'https://example.com/ref-d.png' }],
    },
    params: { projectId: 'project-1' },
    expectedTaskType: TASK_TYPE.MODIFY_ASSET_IMAGE,
    expectedTargetType: 'ProjectPanel',
    expectedProjectId: 'project-1',
  },
  {
    routeFile: 'src/app/api/projects/[projectId]/regenerate-group/route.ts',
    body: { type: 'character', id: 'character-1', appearanceId: 'appearance-1' },
    params: { projectId: 'project-1' },
    expectedTaskType: TASK_TYPE.REGENERATE_GROUP,
    expectedTargetType: 'CharacterAppearance',
    expectedProjectId: 'project-1',
  },
  {
    routeFile: 'src/app/api/projects/[projectId]/regenerate-panel-image/route.ts',
    body: { panelId: 'panel-1', count: 1 },
    params: { projectId: 'project-1' },
    expectedTaskType: TASK_TYPE.IMAGE_PANEL,
    expectedTargetType: 'ProjectPanel',
    expectedProjectId: 'project-1',
  },
  {
    routeFile: 'src/app/api/projects/[projectId]/regenerate-single-image/route.ts',
    body: { type: 'character', id: 'character-1', appearanceId: 'appearance-1', imageIndex: 0 },
    params: { projectId: 'project-1' },
    expectedTaskType: TASK_TYPE.IMAGE_CHARACTER,
    expectedTargetType: 'CharacterAppearance',
    expectedProjectId: 'project-1',
  },
]

export const DIRECT_TEXT_CASES: ReadonlyArray<DirectRouteCase> = [
  {
    routeFile: 'src/app/api/asset-hub/voice-design/route.ts',
    body: { voicePrompt: 'female calm narrator', previewText: '你好世界' },
    expectedTaskType: TASK_TYPE.ASSET_HUB_VOICE_DESIGN,
    expectedTargetType: 'GlobalAssetHubVoiceDesign',
    expectedProjectId: 'global-asset-hub',
  },
  {
    routeFile: 'src/app/api/projects/[projectId]/voice-design/route.ts',
    body: { voicePrompt: 'warm female voice', previewText: 'This is preview text' },
    params: { projectId: 'project-1' },
    expectedTaskType: TASK_TYPE.VOICE_DESIGN,
    expectedTargetType: 'Project',
    expectedProjectId: 'project-1',
  },
  {
    routeFile: 'src/app/api/projects/[projectId]/voice-generate/route.ts',
    body: { episodeId: 'episode-1', lineId: 'line-1', audioModel: 'fal::audio-model' },
    params: { projectId: 'project-1' },
    expectedTaskType: TASK_TYPE.VOICE_LINE,
    expectedTargetType: 'ProjectVoiceLine',
    expectedProjectId: 'project-1',
  },
  {
    routeFile: 'src/app/api/projects/[projectId]/regenerate-storyboard-text/route.ts',
    body: { storyboardId: 'storyboard-1' },
    params: { projectId: 'project-1' },
    expectedTaskType: TASK_TYPE.REGENERATE_STORYBOARD_TEXT,
    expectedTargetType: 'ProjectStoryboard',
    expectedProjectId: 'project-1',
  },
]

export const DIRECT_RUN_CASES: ReadonlyArray<DirectRouteCase> = [
  {
    routeFile: 'src/app/api/projects/[projectId]/insert-panel/route.ts',
    body: { storyboardId: 'storyboard-1', insertAfterPanelId: 'panel-ins' },
    params: { projectId: 'project-1' },
    expectedTaskType: TASK_TYPE.INSERT_PANEL,
    expectedTargetType: 'ProjectStoryboard',
    expectedProjectId: 'project-1',
    expectedPayloadSubset: {
      storyboardId: 'storyboard-1',
      insertAfterPanelId: 'panel-ins',
      userInput: '请根据前后镜头自动分析并插入一个自然衔接的新分镜。',
    },
  },
  {
    routeFile: 'src/app/api/projects/[projectId]/panel-variant/route.ts',
    body: {
      storyboardId: 'storyboard-1',
      insertAfterPanelId: 'panel-ins',
      sourcePanelId: 'panel-src',
      variant: { video_prompt: 'new prompt', description: 'variant desc' },
    },
    params: { projectId: 'project-1' },
    expectedTaskType: TASK_TYPE.PANEL_VARIANT,
    expectedTargetType: 'ProjectPanel',
    expectedProjectId: 'project-1',
  },
]
