import { describe, expect, it } from 'vitest'
import { renderAssistantSystemPrompt } from '@/lib/assistant-platform/system-prompts'

describe('assistant-platform system prompts', () => {
  it('loads api-config-template prompt from lib/prompts/skills and injects providerId', () => {
    const prompt = renderAssistantSystemPrompt('api-config-template', {
      providerId: 'openai-compatible:oa-1',
    })

    expect(prompt).toContain('你是 API 配置助手')
    expect(prompt).toContain('当前 providerId=openai-compatible:oa-1')
    expect(prompt).not.toContain('{{providerId}}')
  })

  it('loads tutorial prompt from lib/prompts/skills', () => {
    const prompt = renderAssistantSystemPrompt('tutorial')

    expect(prompt).toContain('你是产品教程助手')
    expect(prompt).toContain('禁止编造不存在的页面')
  })
})
