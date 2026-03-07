import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  userPreference: {
    findUnique: vi.fn(),
  },
}))

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

import { resolveAnalysisModel } from '@/lib/workers/handlers/resolve-analysis-model'

describe('resolveAnalysisModel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.userPreference.findUnique.mockResolvedValue({
      analysisModel: 'openai-compatible:pref::gpt-4.1-mini',
    })
  })

  it('uses inputModel override when provided', async () => {
    const result = await resolveAnalysisModel({
      userId: 'user-1',
      inputModel: 'openai-compatible:input::gpt-4.1',
      projectAnalysisModel: 'openai-compatible:project::gpt-4.1',
    })

    expect(result).toBe('openai-compatible:input::gpt-4.1')
    expect(prismaMock.userPreference.findUnique).not.toHaveBeenCalled()
  })

  it('uses project analysisModel when inputModel is missing', async () => {
    const result = await resolveAnalysisModel({
      userId: 'user-1',
      projectAnalysisModel: 'openai-compatible:project::gpt-4.1',
    })

    expect(result).toBe('openai-compatible:project::gpt-4.1')
    expect(prismaMock.userPreference.findUnique).not.toHaveBeenCalled()
  })

  it('falls back to user preference analysisModel when project is missing', async () => {
    const result = await resolveAnalysisModel({
      userId: 'user-1',
      projectAnalysisModel: null,
    })

    expect(result).toBe('openai-compatible:pref::gpt-4.1-mini')
    expect(prismaMock.userPreference.findUnique).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      select: { analysisModel: true },
    })
  })

  it('skips invalid input/project model keys and still falls back to user preference', async () => {
    const result = await resolveAnalysisModel({
      userId: 'user-1',
      inputModel: 'gpt-4.1',
      projectAnalysisModel: 'invalid-model-key',
    })

    expect(result).toBe('openai-compatible:pref::gpt-4.1-mini')
    expect(prismaMock.userPreference.findUnique).toHaveBeenCalledTimes(1)
  })

  it('throws explicit error when all levels are missing', async () => {
    prismaMock.userPreference.findUnique.mockResolvedValueOnce({ analysisModel: null })

    await expect(resolveAnalysisModel({
      userId: 'user-1',
      inputModel: '',
      projectAnalysisModel: null,
    })).rejects.toThrow('ANALYSIS_MODEL_NOT_CONFIGURED')
  })
})
