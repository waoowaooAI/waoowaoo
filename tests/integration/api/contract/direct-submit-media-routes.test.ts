import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  authState,
  configServiceMock,
  DIRECT_MEDIA_CASES,
  hasOutputMock,
  invokePostRoute,
  prismaMock,
  resetDirectSubmitMocks,
  submitTaskMock,
} from '../helpers/direct-submit-contract'

vi.mock('@/lib/api-auth', () => {
  const unauthorized = () => new Response(
    JSON.stringify({ error: { code: 'UNAUTHORIZED' } }),
    { status: 401, headers: { 'content-type': 'application/json' } },
  )

  return {
    isErrorResponse: (value: unknown) => value instanceof Response,
    requireUserAuth: async () => {
      if (!authState.authenticated) return unauthorized()
      return { session: { user: { id: 'user-1' } } }
    },
    requireProjectAuth: async (projectId: string) => {
      if (!authState.authenticated) return unauthorized()
      return {
        session: { user: { id: 'user-1' } },
        project: { id: projectId, userId: 'user-1' },
      }
    },
    requireProjectAuthLight: async (projectId: string) => {
      if (!authState.authenticated) return unauthorized()
      return {
        session: { user: { id: 'user-1' } },
        project: { id: projectId, userId: 'user-1' },
      }
    },
  }
})

vi.mock('@/lib/task/submitter', () => ({
  submitTask: submitTaskMock,
}))
vi.mock('@/lib/task/resolve-locale', () => ({
  resolveRequiredTaskLocale: vi.fn(() => 'zh'),
}))
vi.mock('@/lib/config-service', () => configServiceMock)
vi.mock('@/lib/task/has-output', () => hasOutputMock)
vi.mock('@/lib/billing', () => ({
  buildDefaultTaskBillingInfo: vi.fn(() => ({ mode: 'default' })),
}))
vi.mock('@/lib/providers/bailian/voice-design', () => ({
  validateVoicePrompt: vi.fn(() => ({ valid: true })),
  validatePreviewText: vi.fn(() => ({ valid: true })),
}))
vi.mock('@/lib/media/outbound-image', () => ({
  sanitizeImageInputsForTaskPayload: vi.fn((inputs: unknown[]) => ({
    normalized: inputs
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
    issues: [] as Array<{ reason: string }>,
  })),
}))
vi.mock('@/lib/model-capabilities/lookup', () => ({
  resolveBuiltinCapabilitiesByModelKey: vi.fn(() => ({ video: { firstlastframe: true } })),
}))
vi.mock('@/lib/model-pricing/lookup', () => ({
  resolveBuiltinPricing: vi.fn(() => ({ status: 'ok' })),
}))
vi.mock('@/lib/api-config', () => ({
  resolveModelSelection: vi.fn(async () => ({
    model: 'img::storyboard',
  })),
  resolveModelSelectionOrSingle: vi.fn(async (_userId: string, model: string | null | undefined) => {
    const modelKey = typeof model === 'string' && model.trim().length > 0
      ? model.trim()
      : 'fal::audio-model'
    const separator = modelKey.indexOf('::')
    const provider = separator === -1 ? modelKey : modelKey.slice(0, separator)
    const modelId = separator === -1 ? modelKey : modelKey.slice(separator + 2)
    return {
      provider,
      modelId,
      modelKey,
      mediaType: 'audio',
    }
  }),
  getProviderKey: vi.fn((providerId: string) => {
    const marker = providerId.indexOf(':')
    return marker === -1 ? providerId : providerId.slice(0, marker)
  }),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

describe('api contract - direct submit media routes (behavior)', () => {
  beforeEach(() => {
    resetDirectSubmitMocks()
  })

  it('keeps expected coverage size', () => {
    expect(DIRECT_MEDIA_CASES.length).toBe(14)
  })

  for (const routeCase of DIRECT_MEDIA_CASES) {
    it(`${routeCase.routeFile} -> returns 401 when unauthenticated`, async () => {
      authState.authenticated = false
      const res = await invokePostRoute(routeCase)
      expect(res.status).toBe(401)
      expect(submitTaskMock).not.toHaveBeenCalled()
    })

    it(`${routeCase.routeFile} -> submits task with expected contract when authenticated`, async () => {
      const res = await invokePostRoute(routeCase)
      expect(res.status).toBe(200)
      expect(submitTaskMock).toHaveBeenCalledWith(expect.objectContaining({
        type: routeCase.expectedTaskType,
        targetType: routeCase.expectedTargetType,
        projectId: routeCase.expectedProjectId,
        userId: 'user-1',
      }))

      const submitArg = submitTaskMock.mock.calls.at(-1)?.[0] as Record<string, unknown> | undefined
      expect(submitArg?.type).toBe(routeCase.expectedTaskType)
      expect(submitArg?.targetType).toBe(routeCase.expectedTargetType)
      expect(submitArg?.projectId).toBe(routeCase.expectedProjectId)
      expect(submitArg?.userId).toBe('user-1')
      if (routeCase.expectedPayloadSubset) {
        expect(submitArg?.payload).toEqual(expect.objectContaining(routeCase.expectedPayloadSubset))
      }

      const json = await res.json() as Record<string, unknown>
      expect(json.async).toBe(true)
      expect(typeof json.taskId).toBe('string')
    })
  }
})
