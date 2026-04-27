import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  userStylePreset: {
    findFirst: vi.fn(),
  },
  project: {
    findUnique: vi.fn(),
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

describe('regression - user style presets resolve live values', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses the edited user preset config on the next visual style resolution', async () => {
    const { resolveProjectVisualStylePreset } = await import('@/lib/style-preset')
    prismaMock.project.findUnique.mockResolvedValue({
      visualStylePresetSource: 'user',
      visualStylePresetId: 'preset-1',
      artStyle: 'american-comic',
    })
    prismaMock.userStylePreset.findFirst
      .mockResolvedValueOnce({
        id: 'preset-1',
        userId: 'user-1',
        kind: 'visual_style',
        name: 'Live',
        summary: null,
        config: JSON.stringify({
          prompt: 'old prompt',
          negativePrompt: '',
          colorPalette: [],
          lineStyle: '',
          texture: '',
          lighting: '',
          composition: '',
          detailLevel: 'medium',
        }),
        archivedAt: null,
      })
      .mockResolvedValueOnce({
        id: 'preset-1',
        userId: 'user-1',
        kind: 'visual_style',
        name: 'Live',
        summary: null,
        config: JSON.stringify({
          prompt: 'new prompt',
          negativePrompt: '',
          colorPalette: [],
          lineStyle: '',
          texture: '',
          lighting: '',
          composition: '',
          detailLevel: 'medium',
        }),
        archivedAt: null,
      })

    const first = await resolveProjectVisualStylePreset({
      projectId: 'project-1',
      userId: 'user-1',
      locale: 'zh',
    })
    const second = await resolveProjectVisualStylePreset({
      projectId: 'project-1',
      userId: 'user-1',
      locale: 'zh',
    })

    expect(first.prompt).toBe('old prompt')
    expect(second.prompt).toBe('new prompt')
  })

  it('rejects archived presets when resolving project visual styles', async () => {
    const { resolveProjectVisualStylePreset } = await import('@/lib/style-preset')
    prismaMock.project.findUnique.mockResolvedValue({
      visualStylePresetSource: 'user',
      visualStylePresetId: 'preset-archived',
      artStyle: 'american-comic',
    })
    prismaMock.userStylePreset.findFirst.mockResolvedValue(null)

    await expect(resolveProjectVisualStylePreset({
      projectId: 'project-1',
      userId: 'user-1',
      locale: 'zh',
    })).rejects.toThrow('USER_STYLE_PRESET_NOT_FOUND:visual_style:preset-archived')
  })
})
