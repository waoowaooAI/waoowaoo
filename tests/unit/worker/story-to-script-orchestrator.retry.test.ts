import { describe, expect, it, vi } from 'vitest'
import { runStoryToScriptOrchestrator } from '@/lib/novel-promotion/story-to-script/orchestrator'

describe('story-to-script orchestrator retry', () => {
  it('retries retryable step failure up to 3 attempts', async () => {
    const actionCalls = new Map<string, number>()
    const characterMetas: Array<{ stepId: string; stepAttempt?: number }> = []
    const runStep = vi.fn(async (meta, _prompt, action: string) => {
      actionCalls.set(action, (actionCalls.get(action) || 0) + 1)

      if (action === 'analyze_characters') {
        characterMetas.push({ stepId: meta.stepId, stepAttempt: meta.stepAttempt })
        const count = actionCalls.get(action) || 0
        if (count < 3) {
          throw new TypeError('terminated')
        }
        return { text: JSON.stringify({ characters: [{ name: '甲', introduction: '人物介绍' }] }), reasoning: '' }
      }
      if (action === 'analyze_locations') {
        return { text: JSON.stringify({ locations: [{ name: '地点A' }] }), reasoning: '' }
      }
      if (action === 'split_clips') {
        return {
          text: JSON.stringify([
            {
              start: '甲在门口',
              end: '乙回答',
              summary: '片段摘要',
              location: '地点A',
              characters: ['甲'],
            },
          ]),
          reasoning: '',
        }
      }
      return { text: JSON.stringify({ scenes: [{ id: 1 }] }), reasoning: '' }
    })

    const result = await runStoryToScriptOrchestrator({
      content: '甲在门口。乙回答。',
      baseCharacters: [],
      baseLocations: [],
      baseCharacterIntroductions: [],
      promptTemplates: {
        characterPromptTemplate: '{input} {characters_lib_name} {characters_lib_info}',
        locationPromptTemplate: '{input} {locations_lib_name}',
        clipPromptTemplate: '{input} {locations_lib_name} {characters_lib_name} {characters_introduction}',
        screenplayPromptTemplate: '{clip_content} {locations_lib_name} {characters_lib_name} {characters_introduction} {clip_id}',
      },
      runStep,
    })

    expect(result.summary.clipCount).toBe(1)
    expect(actionCalls.get('analyze_characters')).toBe(3)
    expect(characterMetas).toEqual([
      { stepId: 'analyze_characters', stepAttempt: undefined },
      { stepId: 'analyze_characters', stepAttempt: 2 },
      { stepId: 'analyze_characters', stepAttempt: 3 },
    ])
  })

  it('does not retry non-retryable failures', async () => {
    const actionCalls = new Map<string, number>()
    const runStep = vi.fn(async (_meta, _prompt, action: string) => {
      actionCalls.set(action, (actionCalls.get(action) || 0) + 1)
      if (action === 'analyze_characters') {
        throw new Error('SENSITIVE_CONTENT: blocked')
      }
      return { text: JSON.stringify({ locations: [{ name: '地点A' }] }), reasoning: '' }
    })

    await expect(
      runStoryToScriptOrchestrator({
        content: '甲在门口。乙回答。',
        baseCharacters: [],
        baseLocations: [],
        baseCharacterIntroductions: [],
        promptTemplates: {
          characterPromptTemplate: '{input} {characters_lib_name} {characters_lib_info}',
          locationPromptTemplate: '{input} {locations_lib_name}',
          clipPromptTemplate: '{input} {locations_lib_name} {characters_lib_name} {characters_introduction}',
          screenplayPromptTemplate: '{clip_content} {locations_lib_name} {characters_lib_name} {characters_introduction} {clip_id}',
        },
        runStep,
      }),
    ).rejects.toThrow('SENSITIVE_CONTENT')

    expect(actionCalls.get('analyze_characters')).toBe(1)
  })
})
