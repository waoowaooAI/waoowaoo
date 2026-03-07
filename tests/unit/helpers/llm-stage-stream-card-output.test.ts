import { describe, expect, it } from 'vitest'
import { splitStructuredOutput } from '@/components/llm-console/LLMStageStreamCard'

describe('LLMStageStreamCard structured output parsing', () => {
  it('moves think-tagged text from final block into reasoning', () => {
    const parsed = splitStructuredOutput(`【思考过程】
已有思考

【最终结果】
<think>追加思考</think>
{"locations":[]}`)

    expect(parsed.reasoning).toContain('已有思考')
    expect(parsed.reasoning).toContain('追加思考')
    expect(parsed.finalText).toBe('{"locations":[]}')
  })

  it('handles unmatched think opening tag during streaming', () => {
    const parsed = splitStructuredOutput(`【最终结果】
<think>流式中的思考还没结束`)

    expect(parsed.reasoning).toBe('流式中的思考还没结束')
    expect(parsed.finalText).toBe('')
  })
})
