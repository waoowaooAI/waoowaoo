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

  it('matches split_clips boundaries with markdown headings, emoji numbering and korean line breaks', async () => {
    const content = [
      '# 1️⃣ 프롤로그',
      '도시의 밤이 길게 이어진다.',
      '',
      '## 2️⃣ 문 앞에서',
      '수진이 말했다:',
      '지금 갈게!',
      '',
      '### 3️⃣ 골목 끝',
      '민호가 대답했다.',
    ].join('\n')

    const runStep = vi.fn(async (_meta, _prompt, action: string) => {
      if (action === 'analyze_characters') {
        return { text: JSON.stringify({ characters: [{ name: '수진', introduction: '주인공' }] }), reasoning: '' }
      }
      if (action === 'analyze_locations') {
        return { text: JSON.stringify({ locations: [{ name: '골목' }] }), reasoning: '' }
      }
      if (action === 'split_clips') {
        return {
          text: JSON.stringify([
            {
              start: '2. 문 앞에서',
              end: '수진이 말했다 지금 갈게!',
              summary: '문 앞 장면',
              location: '골목',
              characters: ['수진'],
            },
          ]),
          reasoning: '',
        }
      }
      return { text: JSON.stringify({ scenes: [{ id: 1 }] }), reasoning: '' }
    })

    const result = await runStoryToScriptOrchestrator({
      content,
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
    expect(result.clipList[0]?.content).toContain('문 앞에서')
    expect(result.clipList[0]?.content).toContain('지금 갈게!')
  })
})
