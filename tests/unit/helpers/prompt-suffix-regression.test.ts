import { describe, expect, it } from 'vitest'
import {
  addCharacterPromptSuffix,
  CHARACTER_PROMPT_SUFFIX,
  removeCharacterPromptSuffix,
} from '@/lib/constants'

function countOccurrences(input: string, target: string) {
  if (!target) return 0
  return input.split(target).length - 1
}

describe('character prompt suffix regression', () => {
  it('appends suffix when generating prompt', () => {
    const basePrompt = 'A brave knight in silver armor'
    const generated = addCharacterPromptSuffix(basePrompt)

    expect(generated).toContain(CHARACTER_PROMPT_SUFFIX)
    expect(countOccurrences(generated, CHARACTER_PROMPT_SUFFIX)).toBe(1)
  })

  it('removes suffix text from prompt', () => {
    const basePrompt = 'A calm detective with short black hair'
    const withSuffix = addCharacterPromptSuffix(basePrompt)
    const removed = removeCharacterPromptSuffix(withSuffix)

    expect(removed).not.toContain(CHARACTER_PROMPT_SUFFIX)
    expect(removed).toContain(basePrompt)
  })

  it('uses suffix as full prompt when base prompt is empty', () => {
    expect(addCharacterPromptSuffix('')).toBe(CHARACTER_PROMPT_SUFFIX)
    expect(removeCharacterPromptSuffix('')).toBe('')
  })
})
