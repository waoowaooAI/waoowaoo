import { describe, expect, it } from 'vitest'
import { buildAiPrompt, getAiPromptTemplate, resolveAiPromptIdFromWorkflowSkillId } from '@/lib/ai-prompts'
import { AI_PROMPT_IDS } from '@/lib/ai-prompts/ids'
import { buildDirectorStyleDoc } from '@/lib/director-style'

describe('ai prompt registry', () => {
  it('maps workflow skill ids to the same unified template id', () => {
    expect(resolveAiPromptIdFromWorkflowSkillId('analyze-characters')).toBe(AI_PROMPT_IDS.CHARACTER_ANALYZE)
    expect(resolveAiPromptIdFromWorkflowSkillId('plan-storyboard-phase1')).toBe(AI_PROMPT_IDS.STORYBOARD_PLAN)
  })

  it('loads unified template content from the new functional directory', () => {
    const template = getAiPromptTemplate(AI_PROMPT_IDS.PROP_ANALYZE, 'zh')

    expect(template).toContain('关键剧情道具资产分析师')
    expect(template).toContain('宁缺毋滥')
  })

  it('renders placeholders through the unified prompt builder', () => {
    const prompt = buildAiPrompt({
      promptId: AI_PROMPT_IDS.CHARACTER_CREATE,
      locale: 'zh',
      variables: {
        user_input: '创建一个阴郁的老管家',
      },
    })

    expect(prompt).toContain('创建一个阴郁的老管家')
  })

  it('injects director style requirements for prompts that opt into style fields', () => {
    const prompt = buildAiPrompt({
      promptId: AI_PROMPT_IDS.CHARACTER_ANALYZE,
      locale: 'zh',
      variables: {
        input: '她推门进屋。',
        characters_lib_info: '暂无已有角色',
      },
      directorStyleDoc: buildDirectorStyleDoc('horror-suspense'),
    })

    expect(prompt).toContain('【导演风格要求】')
    expect(prompt).toContain('危险感')
    expect(prompt).toContain('"judgement"')
  })
})
