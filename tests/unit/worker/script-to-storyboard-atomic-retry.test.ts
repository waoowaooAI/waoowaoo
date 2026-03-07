import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  parseStoryboardRetryTarget,
  runScriptToStoryboardAtomicRetry,
} from '@/lib/workers/handlers/script-to-storyboard-atomic-retry'

const listArtifactsMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/run-runtime/service', () => ({
  listArtifacts: listArtifactsMock,
}))

describe('script-to-storyboard atomic retry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('解析 clip+phase stepKey', () => {
    expect(parseStoryboardRetryTarget('clip_clip-1_phase3_detail')).toEqual({
      stepKey: 'clip_clip-1_phase3_detail',
      clipId: 'clip-1',
      phase: 'phase3_detail',
    })
    expect(parseStoryboardRetryTarget('voice_analyze')).toBeNull()
    expect(parseStoryboardRetryTarget('clip__phase3')).toBeNull()
  })

  it('phase3 重试只执行 phase3 并读取 phase1/phase2 artifact 续跑', async () => {
    listArtifactsMock.mockImplementation(async (params: {
      runId: string
      artifactType?: string
      refId?: string
    }) => {
      if (params.refId !== 'clip-1') return []
      if (params.artifactType === 'storyboard.clip.phase1') {
        return [{
          id: 'a1',
          runId: params.runId,
          stepKey: 'clip_clip-1_phase1',
          artifactType: 'storyboard.clip.phase1',
          refId: 'clip-1',
          versionHash: null,
          payload: {
            panels: [{ panel_number: 1, description: 'p1', location: 'Office', source_text: 'src', characters: [] }],
          },
          createdAt: '2026-03-03T00:00:00.000Z',
        }]
      }
      if (params.artifactType === 'storyboard.clip.phase2.cine') {
        return [{
          id: 'a2',
          runId: params.runId,
          stepKey: 'clip_clip-1_phase2_cinematography',
          artifactType: 'storyboard.clip.phase2.cine',
          refId: 'clip-1',
          versionHash: null,
          payload: {
            rules: [{
              panel_number: 1,
              composition: '居中',
              lighting: '顶光',
              color_palette: '冷色',
              atmosphere: '紧张',
              technical_notes: 'note',
            }],
          },
          createdAt: '2026-03-03T00:00:00.000Z',
        }]
      }
      if (params.artifactType === 'storyboard.clip.phase2.acting') {
        return [{
          id: 'a3',
          runId: params.runId,
          stepKey: 'clip_clip-1_phase2_acting',
          artifactType: 'storyboard.clip.phase2.acting',
          refId: 'clip-1',
          versionHash: null,
          payload: {
            directions: [{ panel_number: 1, characters: [{ name: 'Narrator', expression: 'serious' }] }],
          },
          createdAt: '2026-03-03T00:00:00.000Z',
        }]
      }
      if (params.artifactType === 'storyboard.clip.phase3') {
        return []
      }
      return []
    })

    const runStep = vi.fn(async (_meta, _prompt, action: string) => {
      if (action !== 'storyboard_phase3_detail') {
        throw new Error(`unexpected action ${action}`)
      }
      return {
        text: JSON.stringify([{ panel_number: 1, description: 'phase3-new', location: 'Office', source_text: 'src', characters: [] }]),
        reasoning: '',
      }
    })

    const result = await runScriptToStoryboardAtomicRetry({
      runId: 'run-1',
      retryTarget: {
        stepKey: 'clip_clip-1_phase3_detail',
        clipId: 'clip-1',
        phase: 'phase3_detail',
      },
      retryStepAttempt: 4,
      clip: {
        id: 'clip-1',
        content: 'clip content',
        characters: JSON.stringify([{ name: 'Narrator' }]),
        location: 'Office',
        screenplay: null,
      },
      clipIndex: 0,
      totalClipCount: 1,
      novelPromotionData: {
        characters: [{ name: 'Narrator', appearances: [] }],
        locations: [{ name: 'Office', images: [{ description: 'room desc' }] }],
      },
      promptTemplates: {
        phase1PlanTemplate: '{clip_content}',
        phase2CinematographyTemplate: '{panels_json} {panel_count} {locations_description} {characters_info}',
        phase2ActingTemplate: '{panels_json} {panel_count} {characters_info}',
        phase3DetailTemplate: '{panels_json} {characters_age_gender} {locations_description}',
      },
      runStep,
    })

    expect(runStep).toHaveBeenCalledTimes(1)
    expect(runStep.mock.calls[0]?.[2]).toBe('storyboard_phase3_detail')
    expect(result.phase1PanelsByClipId).toEqual({})
    expect(result.phase2CinematographyByClipId).toEqual({})
    expect(result.phase2ActingByClipId).toEqual({})
    expect(result.phase3PanelsByClipId['clip-1']).toEqual([
      { panel_number: 1, description: 'phase3-new', location: 'Office', source_text: 'src', characters: [] },
    ])
    expect(result.clipPanels).toHaveLength(1)
    expect(result.clipPanels[0]?.finalPanels[0]).toEqual(expect.objectContaining({
      panel_number: 1,
      description: 'phase3-new',
      photographyPlan: expect.objectContaining({
        composition: '居中',
        lighting: '顶光',
      }),
      actingNotes: [{ name: 'Narrator', expression: 'serious' }],
    }))
    expect(result.totalPanelCount).toBe(1)
  })

  it('phase2 重试缺少 phase3 artifact 时显式失败', async () => {
    listArtifactsMock.mockImplementation(async (params: {
      runId: string
      artifactType?: string
      refId?: string
    }) => {
      if (params.refId !== 'clip-1') return []
      if (params.artifactType === 'storyboard.clip.phase1') {
        return [{
          id: 'a1',
          runId: params.runId,
          stepKey: 'clip_clip-1_phase1',
          artifactType: 'storyboard.clip.phase1',
          refId: 'clip-1',
          versionHash: null,
          payload: { panels: [{ panel_number: 1, description: 'p1', location: 'Office' }] },
          createdAt: '2026-03-03T00:00:00.000Z',
        }]
      }
      if (params.artifactType === 'storyboard.clip.phase2.acting') {
        return [{
          id: 'a2',
          runId: params.runId,
          stepKey: 'clip_clip-1_phase2_acting',
          artifactType: 'storyboard.clip.phase2.acting',
          refId: 'clip-1',
          versionHash: null,
          payload: { directions: [{ panel_number: 1, characters: [] }] },
          createdAt: '2026-03-03T00:00:00.000Z',
        }]
      }
      return []
    })

    const runStep = vi.fn(async (_meta, _prompt, action: string) => {
      if (action !== 'storyboard_phase2_cinematography') {
        throw new Error(`unexpected action ${action}`)
      }
      return {
        text: JSON.stringify([{ panel_number: 1, composition: '居中' }]),
        reasoning: '',
      }
    })

    await expect(runScriptToStoryboardAtomicRetry({
      runId: 'run-2',
      retryTarget: {
        stepKey: 'clip_clip-1_phase2_cinematography',
        clipId: 'clip-1',
        phase: 'phase2_cinematography',
      },
      retryStepAttempt: 2,
      clip: {
        id: 'clip-1',
        content: 'clip content',
        characters: JSON.stringify([{ name: 'Narrator' }]),
        location: 'Office',
        screenplay: null,
      },
      clipIndex: 0,
      totalClipCount: 1,
      novelPromotionData: {
        characters: [{ name: 'Narrator', appearances: [] }],
        locations: [{ name: 'Office', images: [{ description: 'room desc' }] }],
      },
      promptTemplates: {
        phase1PlanTemplate: '{clip_content}',
        phase2CinematographyTemplate: '{panels_json} {panel_count} {locations_description} {characters_info}',
        phase2ActingTemplate: '{panels_json} {panel_count} {characters_info}',
        phase3DetailTemplate: '{panels_json} {characters_age_gender} {locations_description}',
      },
      runStep,
    })).rejects.toThrow('missing dependency artifact: storyboard.clip.phase3')
  })
})
