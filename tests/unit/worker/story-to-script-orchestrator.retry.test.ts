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

  it('does not retry Ark invalid parameter errors even if message contains json', async () => {
    const actionCalls = new Map<string, number>()
    const runStep = vi.fn(async (_meta, _prompt, action: string) => {
      actionCalls.set(action, (actionCalls.get(action) || 0) + 1)
      if (action === 'analyze_characters') {
        throw new Error(
          'Ark Responses 调用失败: 400 - {"error":{"code":"InvalidParameter","message":"json: unknown field \\"reasoning_effort\\""}}',
        )
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
    ).rejects.toThrow('unknown field')

    expect(actionCalls.get('analyze_characters')).toBe(1)
  })

  it('parses first balanced JSON block when model appends extra JSON text', async () => {
    const runStep = vi.fn(async (_meta, _prompt, action: string) => {
      if (action === 'analyze_characters') {
        return {
          text: '{"characters":[{"name":"甲","introduction":"人物介绍"}]}\n{"extra":"ignored"}',
          reasoning: '',
        }
      }
      if (action === 'analyze_locations') {
        return {
          text: '{"locations":[{"name":"地点A"}]}\n{"extra":"ignored"}',
          reasoning: '',
        }
      }
      if (action === 'split_clips') {
        return {
          text: '[{"start":"甲在门口","end":"乙回答","summary":"片段摘要","location":"地点A","characters":["甲"]}]\n{"extra":"ignored"}',
          reasoning: '',
        }
      }
      if (action === 'screenplay_conversion') {
        return {
          text: '{"scenes":[{"scene_number":1,"content":[{"type":"action","text":"甲在门口。"}]}]}\n{"extra":"ignored"}',
          reasoning: '',
        }
      }
      throw new Error(`unexpected action: ${action}`)
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
    expect(result.summary.screenplayFailedCount).toBe(0)
    expect(result.summary.screenplaySuccessCount).toBe(1)
    expect(result.screenplayResults[0]).toMatchObject({
      clipId: 'clip_1',
      success: true,
      sceneCount: 1,
    })
  })

  it('enforces topology: split waits for analyses, screenplay waits for split', async () => {
    const actionOrder: string[] = []
    const runStep = vi.fn(async (_meta, _prompt, action: string) => {
      actionOrder.push(action)
      if (action === 'analyze_characters') {
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
      if (action === 'screenplay_conversion') {
        return {
          text: JSON.stringify({ scenes: [{ scene_number: 1 }] }),
          reasoning: '',
        }
      }
      throw new Error(`unexpected action: ${action}`)
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
    const analyzeCharactersIndex = actionOrder.indexOf('analyze_characters')
    const analyzeLocationsIndex = actionOrder.indexOf('analyze_locations')
    const splitIndex = actionOrder.indexOf('split_clips')
    const screenplayIndex = actionOrder.indexOf('screenplay_conversion')
    expect(splitIndex).toBeGreaterThan(Math.max(analyzeCharactersIndex, analyzeLocationsIndex))
    expect(screenplayIndex).toBeGreaterThan(splitIndex)
  })

  it('limits screenplay conversion fan-out by configured concurrency', async () => {
    let activeScreenplay = 0
    let maxActiveScreenplay = 0

    const runStep = vi.fn(async (_meta, _prompt, action: string) => {
      if (action === 'analyze_characters') {
        return { text: JSON.stringify({ characters: [{ name: '甲', introduction: '人物介绍' }] }), reasoning: '' }
      }
      if (action === 'analyze_locations') {
        return { text: JSON.stringify({ locations: [{ name: '地点A' }] }), reasoning: '' }
      }
      if (action === 'split_clips') {
        return {
          text: JSON.stringify([
            { start: '甲在门口', end: '乙回应', summary: '片段1', location: '地点A', characters: ['甲'] },
            { start: '丙出场', end: '丁离开', summary: '片段2', location: '地点A', characters: ['丙'] },
            { start: '戊总结', end: '己收尾', summary: '片段3', location: '地点A', characters: ['戊'] },
          ]),
          reasoning: '',
        }
      }
      if (action === 'screenplay_conversion') {
        activeScreenplay += 1
        maxActiveScreenplay = Math.max(maxActiveScreenplay, activeScreenplay)
        await new Promise((resolve) => setTimeout(resolve, 5))
        activeScreenplay -= 1
        return { text: JSON.stringify({ scenes: [{ scene_number: 1 }] }), reasoning: '' }
      }
      throw new Error(`unexpected action: ${action}`)
    })

    const result = await runStoryToScriptOrchestrator({
      concurrency: 1,
      content: '甲在门口。乙回应。丙出场。丁离开。戊总结。己收尾。',
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

    expect(result.summary.clipCount).toBe(3)
    expect(result.summary.screenplaySuccessCount).toBe(3)
    expect(maxActiveScreenplay).toBe(1)
  })
})
