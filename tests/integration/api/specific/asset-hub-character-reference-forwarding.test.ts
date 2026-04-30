import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'
import { buildMockRequest } from '../../../helpers/request'
import { TASK_TYPE } from '@/lib/task/types'

const authMock = vi.hoisted(() => ({
  requireUserAuth: vi.fn<() => Promise<{ session: { user: { id: string } } } | Response>>(async () => ({
    session: { user: { id: 'user-1' } },
  })),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))

const prismaMock = vi.hoisted(() => ({
  globalAssetFolder: {
    findUnique: vi.fn(),
  },
  globalCharacter: {
    create: vi.fn(async () => ({ id: 'character-1', userId: 'user-1' })),
    findUnique: vi.fn(async () => ({
      id: 'character-1',
      userId: 'user-1',
      name: 'Hero',
      appearances: [],
    })),
  },
  globalCharacterAppearance: {
    create: vi.fn(async () => ({ id: 'appearance-1' })),
  },
}))

const mediaAttachMock = vi.hoisted(() => ({
  attachMediaFieldsToGlobalCharacter: vi.fn(async (value: unknown) => value),
}))

const mediaServiceMock = vi.hoisted(() => ({
  resolveMediaRefFromLegacyValue: vi.fn(async () => null),
}))

const configServiceMock = vi.hoisted(() => ({
  getUserModelConfig: vi.fn(async () => ({ analysisModel: 'analysis-model' })),
}))

const submitterMock = vi.hoisted(() => ({
  submitTask: vi.fn<(input: {
    projectId: string
    type: string
    targetType: string
    targetId: string
    payload: Record<string, unknown>
    dedupeKey?: string | null
  }) => Promise<unknown>>(async () => ({ ok: true })),
}))

const billingMock = vi.hoisted(() => ({
  buildDefaultTaskBillingInfo: vi.fn(() => null),
  isBillableTaskType: vi.fn(() => false),
}))

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/media/attach', () => mediaAttachMock)
vi.mock('@/lib/media/service', () => mediaServiceMock)
vi.mock('@/lib/config-service', () => configServiceMock)
vi.mock('@/lib/task/submitter', () => submitterMock)
vi.mock('@/lib/billing', () => billingMock)

describe('api specific - asset hub character reference forwarding', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.globalAssetFolder.findUnique.mockResolvedValue(null)
  })

  it('submits reference-to-character task with locale and reference fields', async () => {
    const mod = await import('@/app/api/asset-hub/characters/route')
    const req = buildMockRequest({
      path: '/api/asset-hub/characters',
      method: 'POST',
      headers: {
        'accept-language': 'zh-CN,zh;q=0.9',
      },
      body: {
        name: 'Hero',
        artStyle: 'realistic',
        generateFromReference: true,
        referenceImageUrl: 'https://example.com/ref.png',
        customDescription: '冷静，黑发',
        count: 5,
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(200)

    expect(submitterMock.submitTask).toHaveBeenCalledTimes(1)
    const submitted = submitterMock.submitTask.mock.calls[0]?.[0] as {
      projectId?: string
      type?: string
      targetType?: string
      targetId?: string
      payload?: Record<string, unknown>
      dedupeKey?: string | null
    } | undefined

    expect(submitted?.projectId).toBe('global-asset-hub')
    expect(submitted?.type).toBe(TASK_TYPE.ASSET_HUB_REFERENCE_TO_CHARACTER)
    expect(submitted?.targetType).toBe('GlobalCharacterAppearance')
    expect(submitted?.targetId).toBe('appearance-1')
    expect(submitted?.dedupeKey).toBe('asset_hub_reference_to_character:appearance-1:5')

    const forwarded = (submitted?.payload || {}) as {
      locale?: string
      meta?: { locale?: string }
      customDescription?: string
      artStyle?: string
      referenceImageUrls?: string[]
      analysisModel?: string
      appearanceId?: string
      characterId?: string
      count?: number
    }

    expect(forwarded.locale).toBe('zh')
    expect(forwarded.meta?.locale).toBe('zh')
    expect(forwarded.customDescription).toBe('冷静，黑发')
    expect(forwarded.artStyle).toBe('realistic')
    expect(forwarded.referenceImageUrls).toEqual(['https://example.com/ref.png'])
    expect(forwarded.analysisModel).toBeUndefined()
    expect(forwarded.characterId).toBe('character-1')
    expect(forwarded.appearanceId).toBe('appearance-1')
    expect(forwarded.count).toBe(5)
  })

  it('returns unauthorized when auth fails', async () => {
    authMock.requireUserAuth.mockResolvedValueOnce(
      NextResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 }),
    )
    const mod = await import('@/app/api/asset-hub/characters/route')
    const req = buildMockRequest({
      path: '/api/asset-hub/characters',
      method: 'POST',
      body: { name: 'Hero' },
    })

    const res = await mod.POST(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(401)
  })
})
