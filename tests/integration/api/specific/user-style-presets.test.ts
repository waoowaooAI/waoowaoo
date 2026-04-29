import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildDirectorStyleDoc } from '@/lib/director-style/presets'
import { buildMockRequest } from '../../../helpers/request'

type MockUserStylePreset = {
  id: string
  userId: string
  kind: string
  name: string
  summary: string | null
  config: string
  version: number
  archivedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const authMock = vi.hoisted(() => ({
  requireUserAuth: vi.fn(async () => ({
    session: { user: { id: 'user-1', name: 'User 1' } },
  })),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))

const now = new Date('2026-04-26T00:00:00.000Z')

const prismaMock = vi.hoisted(() => ({
  userStylePreset: {
    findMany: vi.fn(async () => []),
    findFirst: vi.fn(async (): Promise<MockUserStylePreset | null> => null),
    create: vi.fn(async (args: { data: Record<string, unknown> }) => ({
      id: 'preset-1',
      userId: args.data.userId,
      kind: args.data.kind,
      name: args.data.name,
      summary: args.data.summary ?? null,
      config: args.data.config,
      version: 1,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    })),
    update: vi.fn(async (args: { data: Record<string, unknown> }) => ({
      id: 'preset-1',
      userId: 'user-1',
      kind: 'visual_style',
      name: args.data.name ?? 'Warm',
      summary: args.data.summary ?? null,
      config: args.data.config ?? JSON.stringify({
        prompt: 'warm',
        negativePrompt: '',
        colorPalette: [],
        lineStyle: '',
        texture: '',
        lighting: '',
        composition: '',
        detailLevel: 'medium',
      }),
      version: args.data.version ?? 1,
      archivedAt: args.data.archivedAt ?? null,
      createdAt: now,
      updatedAt: now,
    })),
  },
}))

const configServiceMock = vi.hoisted(() => ({
  getUserModelConfig: vi.fn(async () => ({ analysisModel: 'llm::analysis' })),
}))

const promptMock = vi.hoisted(() => ({
  buildAiPrompt: vi.fn(() => 'design prompt'),
  AI_PROMPT_IDS: {
    DESIGN_VISUAL_STYLE_PRESET: 'design-visual-style-preset',
    DESIGN_DIRECTOR_STYLE_PRESET: 'design-director-style-preset',
  },
}))

const billingMock = vi.hoisted(() => ({
  withTextBilling: vi.fn(async (
    _userId: string,
    _model: string,
    _inputTokens: number,
    _outputTokens: number,
    _meta: unknown,
    callback: () => Promise<{ text: string }>,
  ) => await callback()),
}))

const aiRuntimeMock = vi.hoisted(() => ({
  executeAiTextStep: vi.fn(async () => ({
    text: JSON.stringify({
      name: 'AI Warm Ink',
      summary: 'Designed by AI',
      config: {
        prompt: 'warm ink with soft contrast',
        negativePrompt: 'no neon',
        colorPalette: ['amber'],
        lineStyle: 'thin ink',
        texture: 'paper',
        lighting: 'soft',
        composition: 'centered',
        detailLevel: 'medium',
      },
    }),
  })),
}))

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/config-service', () => configServiceMock)
vi.mock('@/lib/ai-prompts', () => promptMock)
vi.mock('@/lib/billing', () => billingMock)
vi.mock('@/lib/ai-exec/engine', () => aiRuntimeMock)

describe('api specific - user style presets', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a user-owned visual style preset with validated config', async () => {
    const mod = await import('@/app/api/user/style-presets/route')
    const req = buildMockRequest({
      path: '/api/user/style-presets',
      method: 'POST',
      body: {
        kind: 'visual_style',
        name: 'Warm Ink',
        summary: 'soft warmth',
        config: {
          prompt: 'warm ink style',
          negativePrompt: 'no neon',
          colorPalette: ['amber'],
          lineStyle: 'thin',
          texture: 'paper',
          lighting: 'soft',
          composition: 'centered',
          detailLevel: 'medium',
        },
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({}) })
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.preset.name).toBe('Warm Ink')
    expect(prismaMock.userStylePreset.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          kind: 'visual_style',
          name: 'Warm Ink',
          config: expect.stringContaining('warm ink style'),
        }),
      }),
    )
  })

  it('rejects invalid visual style configs', async () => {
    const mod = await import('@/app/api/user/style-presets/route')
    const req = buildMockRequest({
      path: '/api/user/style-presets',
      method: 'POST',
      body: {
        kind: 'visual_style',
        name: 'Broken',
        config: {
          prompt: 'broken',
          negativePrompt: '',
          colorPalette: [],
          lineStyle: '',
          texture: '',
          lighting: '',
          composition: '',
          detailLevel: 'extreme',
        },
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({}) })
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error.code).toBe('INVALID_PARAMS')
    expect(prismaMock.userStylePreset.create).not.toHaveBeenCalled()
  })

  it('soft deletes owned presets by writing archivedAt', async () => {
    prismaMock.userStylePreset.findFirst.mockResolvedValueOnce({
      id: 'preset-1',
      userId: 'user-1',
      kind: 'visual_style',
      name: 'Warm',
      summary: null,
      config: JSON.stringify({
        prompt: 'warm',
        negativePrompt: '',
        colorPalette: [],
        lineStyle: '',
        texture: '',
        lighting: '',
        composition: '',
        detailLevel: 'medium',
      }),
      version: 1,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    })

    const mod = await import('@/app/api/user/style-presets/[presetId]/route')
    const req = buildMockRequest({
      path: '/api/user/style-presets/preset-1',
      method: 'DELETE',
    })

    const res = await mod.DELETE(req, { params: Promise.resolve({ presetId: 'preset-1' }) })

    expect(res.status).toBe(200)
    expect(prismaMock.userStylePreset.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'preset-1' },
        data: expect.objectContaining({
          archivedAt: expect.any(Date),
          version: 2,
        }),
      }),
    )
  })

  it('designs a visual style preset through AI and validates the JSON config', async () => {
    const mod = await import('@/app/api/user/style-presets/design/route')
    const req = buildMockRequest({
      path: '/api/user/style-presets/design',
      method: 'POST',
      body: {
        kind: 'visual_style',
        instruction: 'Make a warm ink illustration style',
        locale: 'en',
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({}) })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual(expect.objectContaining({
      kind: 'visual_style',
      name: 'AI Warm Ink',
      summary: 'Designed by AI',
      config: expect.objectContaining({
        prompt: 'warm ink with soft contrast',
        detailLevel: 'medium',
      }),
    }))
    expect(aiRuntimeMock.executeAiTextStep).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      model: 'llm::analysis',
      messages: [{ role: 'user', content: 'design prompt' }],
    }))
  })

  it('designs a director style preset through the director prompt and validates the config', async () => {
    const directorConfig = buildDirectorStyleDoc('horror-suspense')
    aiRuntimeMock.executeAiTextStep.mockResolvedValueOnce({
      text: JSON.stringify({
        name: 'AI Horror Director',
        summary: 'Designed director style',
        config: directorConfig,
      }),
    })
    const mod = await import('@/app/api/user/style-presets/design/route')
    const req = buildMockRequest({
      path: '/api/user/style-presets/design',
      method: 'POST',
      body: {
        kind: 'director_style',
        instruction: 'Make suspense shots with oppressive interior lighting',
        locale: 'en',
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({}) })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(promptMock.buildAiPrompt).toHaveBeenCalledWith(expect.objectContaining({
      promptId: promptMock.AI_PROMPT_IDS.DESIGN_DIRECTOR_STYLE_PRESET,
      variables: {
        instruction: 'Make suspense shots with oppressive interior lighting',
      },
    }))
    expect(billingMock.withTextBilling).toHaveBeenCalledWith(
      'user-1',
      'llm::analysis',
      expect.any(Number),
      2000,
      expect.objectContaining({
        action: 'design_director_style_preset',
        metadata: { kind: 'director_style' },
      }),
      expect.any(Function),
    )
    expect(body).toEqual(expect.objectContaining({
      kind: 'director_style',
      name: 'AI Horror Director',
      summary: 'Designed director style',
      config: expect.objectContaining({
        character: expect.objectContaining({
          temperament: directorConfig.character.temperament,
        }),
        video: expect.objectContaining({
          cameraMotion: directorConfig.video.cameraMotion,
        }),
      }),
    }))
  })
})
