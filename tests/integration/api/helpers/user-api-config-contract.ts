import { vi } from 'vitest'

export type UserPreferenceSnapshot = {
  customProviders: string | null
  customModels: string | null
  analysisModel?: string | null
  characterModel?: string | null
  locationModel?: string | null
  storyboardModel?: string | null
  editModel?: string | null
  videoModel?: string | null
  audioModel?: string | null
  lipSyncModel?: string | null
  capabilityDefaults?: string | null
  analysisConcurrency?: number | null
  imageConcurrency?: number | null
  videoConcurrency?: number | null
}

export type SavedProvider = {
  id: string
  name: string
  baseUrl?: string
  apiKey?: string
  hidden?: boolean
  apiMode?: 'gemini-sdk' | 'openai-official'
  gatewayRoute?: 'official' | 'openai-compat'
}

export const prismaMock = {
  userPreference: {
    findUnique: vi.fn<(...args: unknown[]) => Promise<UserPreferenceSnapshot | null>>(),
    upsert: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  },
}

export const encryptApiKeyMock = vi.fn((value: string) => `enc:${value}`)
export const decryptApiKeyMock = vi.fn((value: string) => value.replace(/^enc:/, ''))
export const getBillingModeMock = vi.fn(async () => 'OFF')

export const routeContext = { params: Promise.resolve({}) }

export function resetUserApiConfigMocks() {
  vi.resetModules()
  vi.clearAllMocks()
  prismaMock.userPreference.findUnique.mockResolvedValue({
    customProviders: null,
    customModels: null,
  })
  prismaMock.userPreference.upsert.mockResolvedValue({ id: 'pref-1' })
  getBillingModeMock.mockResolvedValue('OFF')
}

export function readSavedProvidersFromUpsert(): SavedProvider[] {
  const firstCall = prismaMock.userPreference.upsert.mock.calls[0]
  if (!firstCall) {
    throw new Error('expected prisma.userPreference.upsert to be called at least once')
  }

  const payload = firstCall[0] as { update?: { customProviders?: unknown } }
  const rawProviders = payload.update?.customProviders
  if (typeof rawProviders !== 'string') {
    throw new Error('expected update.customProviders to be a JSON string')
  }

  const parsed = JSON.parse(rawProviders) as unknown
  if (!Array.isArray(parsed)) {
    throw new Error('expected update.customProviders to parse as an array')
  }
  return parsed as SavedProvider[]
}

export function readSavedModelsFromUpsert(): Array<Record<string, unknown>> {
  const firstCall = prismaMock.userPreference.upsert.mock.calls[0]
  if (!firstCall) {
    throw new Error('expected prisma.userPreference.upsert to be called at least once')
  }

  const payload = firstCall[0] as { update?: { customModels?: unknown } }
  const rawModels = payload.update?.customModels
  if (typeof rawModels !== 'string') {
    throw new Error('expected update.customModels to be a JSON string')
  }

  const parsed = JSON.parse(rawModels) as unknown
  if (!Array.isArray(parsed)) {
    throw new Error('expected update.customModels to parse as an array')
  }
  return parsed as Array<Record<string, unknown>>
}
