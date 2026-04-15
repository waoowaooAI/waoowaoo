import { describe, expect, it, vi } from 'vitest'
import { runScriptToStoryboardSkillWorkflow } from '@/lib/skill-system/executors/script-to-storyboard/preset'

describe('script-to-storyboard skill workflow', () => {
  it('retries retryable phase1 failure up to 3 attempts', async () => {
    const attemptsByAction = new Map<string, number>()
    const phase1Metas: Array<{ stepId: string; stepAttempt?: number }> = []
    const runStep = vi.fn(async (meta, _prompt, action: string) => {
      attemptsByAction.set(action, (attemptsByAction.get(action) || 0) + 1)

      if (action === 'storyboard_phase1_plan') {
        phase1Metas.push({ stepId: meta.stepId, stepAttempt: meta.stepAttempt })
        const attempt = attemptsByAction.get(action) || 0
        if (attempt < 3) {
          throw new TypeError('terminated')
        }
        return {
          text: JSON.stringify([{ panel_number: 1, description: '镜头', location: '场景A', source_text: '原文', characters: [] }]),
          reasoning: '',
        }
      }
      if (action === 'storyboard_phase2_cinematography') {
        return {
          text: JSON.stringify([{
            panel_number: 1,
            composition: '居中',
            lighting: '顶光',
            color_palette: '冷色',
            atmosphere: '紧张',
            technical_notes: 'note',
          }]),
          reasoning: '',
        }
      }
      if (action === 'storyboard_phase2_acting') {
        return { text: JSON.stringify([{ panel_number: 1, characters: [] }]), reasoning: '' }
      }
      if (action === 'storyboard_phase3_detail') {
        return {
          text: JSON.stringify([{ panel_number: 1, description: '镜头', location: '场景A', source_text: '原文', characters: [] }]),
          reasoning: '',
        }
      }
      return {
        text: JSON.stringify([{
          lineIndex: 1,
          speaker: '旁白',
          content: '一句话',
          emotionStrength: 0.8,
          matchedPanel: {
            storyboardId: 'clip-1',
            panelIndex: 0,
          },
        }]),
        reasoning: '',
      }
    })

    const result = await runScriptToStoryboardSkillWorkflow({
      locale: 'zh',
      clips: [
        {
          id: 'clip-1',
          content: '文本',
          characters: JSON.stringify([{ name: '角色A' }]),
          location: '场景A',
          screenplay: null,
        },
      ],
      novelText: '完整文本',
      projectData: {
        characters: [{ name: '角色A', appearances: [] }],
        locations: [{ name: '场景A', images: [] }],
      },
      runStep,
    })

    expect(result.summary.clipCount).toBe(1)
    expect(result.voiceLineRows).toHaveLength(1)
    expect(attemptsByAction.get('storyboard_phase1_plan')).toBe(3)
    expect(runStep.mock.calls[0]?.[1]).toContain('# Plan Storyboard Phase 1')
    expect(phase1Metas).toEqual([
      { stepId: 'clip_clip-1_phase1', stepAttempt: undefined },
      { stepId: 'clip_clip-1_phase1', stepAttempt: 2 },
      { stepId: 'clip_clip-1_phase1', stepAttempt: 3 },
    ])
  })

  it('enforces topology: phase3 runs after both phase2 steps complete', async () => {
    const actionOrder: string[] = []
    const runStep = vi.fn(async (_meta, _prompt, action: string) => {
      actionOrder.push(action)
      if (action === 'storyboard_phase1_plan') {
        return {
          text: JSON.stringify([{ panel_number: 1, description: '镜头', location: '场景A', source_text: '原文', characters: [] }]),
          reasoning: '',
        }
      }
      if (action === 'storyboard_phase2_cinematography') {
        return {
          text: JSON.stringify([{
            panel_number: 1,
            composition: '居中',
            lighting: '顶光',
            color_palette: '冷色',
            atmosphere: '紧张',
            technical_notes: 'note',
          }]),
          reasoning: '',
        }
      }
      if (action === 'storyboard_phase2_acting') {
        return { text: JSON.stringify([{ panel_number: 1, characters: [] }]), reasoning: '' }
      }
      if (action === 'storyboard_phase3_detail') {
        return {
          text: JSON.stringify([{ panel_number: 1, description: '镜头', location: '场景A', source_text: '原文', characters: [] }]),
          reasoning: '',
        }
      }
      if (action === 'voice_analyze') {
        return {
          text: JSON.stringify([{
            lineIndex: 1,
            speaker: '旁白',
            content: '一句话',
            emotionStrength: 0.8,
            matchedPanel: {
              storyboardId: 'clip-1',
              panelIndex: 0,
            },
          }]),
          reasoning: '',
        }
      }
      throw new Error(`unexpected action: ${action}`)
    })

    const result = await runScriptToStoryboardSkillWorkflow({
      locale: 'zh',
      clips: [
        {
          id: 'clip-1',
          content: '文本',
          characters: JSON.stringify([{ name: '角色A' }]),
          location: '场景A',
          screenplay: null,
        },
      ],
      novelText: '完整文本',
      projectData: {
        characters: [{ name: '角色A', appearances: [] }],
        locations: [{ name: '场景A', images: [] }],
      },
      runStep,
    })

    expect(result.summary.clipCount).toBe(1)
    const phase3Index = actionOrder.indexOf('storyboard_phase3_detail')
    expect(phase3Index).toBeGreaterThan(actionOrder.indexOf('storyboard_phase2_cinematography'))
    expect(phase3Index).toBeGreaterThan(actionOrder.indexOf('storyboard_phase2_acting'))
    expect(actionOrder.indexOf('voice_analyze')).toBeGreaterThan(phase3Index)
  })
})
