import type { UIMessage } from 'ai'
import { describe, expect, it } from 'vitest'
import { extractMessageContent } from '@/components/assistant/AssistantChatModal'

function createAssistantMessage(parts: Array<Record<string, unknown>>): UIMessage {
  return {
    id: 'assistant-message',
    role: 'assistant',
    parts,
  } as unknown as UIMessage
}

describe('assistant chat modal message content parser', () => {
  it('keeps reasoning parts out of normal visible lines', () => {
    const message = createAssistantMessage([
      { type: 'reasoning', text: '先分析接口字段映射' },
      { type: 'text', text: '我需要你的 status 返回样例。' },
    ])

    const content = extractMessageContent(message)

    expect(content.lines).toEqual(['我需要你的 status 返回样例。'])
    expect(content.reasoningLines).toEqual(['先分析接口字段映射'])
  })

  it('extracts think tags from text into reasoning section', () => {
    const message = createAssistantMessage([
      {
        type: 'text',
        text: '<think>先确认 create/status/content 三个端点</think>请补充 status 返回 JSON',
      },
    ])

    const content = extractMessageContent(message)

    expect(content.lines).toEqual(['请补充 status 返回 JSON'])
    expect(content.reasoningLines).toEqual(['先确认 create/status/content 三个端点'])
  })

  it('extracts reasoning from unclosed think tag during streaming', () => {
    const message = createAssistantMessage([
      {
        type: 'text',
        text: '<think>先确认任务状态枚举和输出路径',
      },
    ])

    const content = extractMessageContent(message)

    expect(content.lines).toEqual([])
    expect(content.reasoningLines).toEqual(['先确认任务状态枚举和输出路径'])
  })

  it('preserves tool output and issues as visible lines', () => {
    const message = createAssistantMessage([
      {
        type: 'tool-saveModelTemplate',
        state: 'output-available',
        output: {
          message: '模型已保存',
          issues: [{ field: 'response.statusPath', message: 'missing' }],
        },
      },
    ])

    const content = extractMessageContent(message)

    expect(content.lines).toEqual(['模型已保存', 'response.statusPath: missing'])
    expect(content.reasoningLines).toEqual([])
  })
})
