import { describe, expect, it } from 'vitest'
import {
  buildDirectorStyleDoc,
  parseDirectorStyleDoc,
  resolveDirectorStyleFieldsFromPreset,
  resolveDirectorStyleRequirements,
} from '@/lib/director-style'
import { AI_PROMPT_IDS } from '@/lib/ai-prompts'

describe('director style', () => {
  it('builds the persisted horror suspense document from the preset id', () => {
    const fields = resolveDirectorStyleFieldsFromPreset('horror-suspense')

    expect(fields.directorStylePresetId).toBe('horror-suspense')
    expect(fields.directorStyleDoc).toContain('"storyboardPlan"')
  })

  it('parses a persisted style document and resolves prompt specific requirements', () => {
    const rawDoc = JSON.stringify(buildDirectorStyleDoc('horror-suspense'))
    const doc = parseDirectorStyleDoc(rawDoc)

    expect(doc).not.toBeNull()
    expect(resolveDirectorStyleRequirements(AI_PROMPT_IDS.CHARACTER_ANALYZE, doc)).toContain('危险感')
    expect(resolveDirectorStyleRequirements(AI_PROMPT_IDS.CHARACTER_ANALYZE, doc)).toContain('"priorities"')
    expect(resolveDirectorStyleRequirements(AI_PROMPT_IDS.PANEL_IMAGE_GENERATE, doc)).toContain('冷色')
    expect(resolveDirectorStyleRequirements(AI_PROMPT_IDS.PANEL_IMAGE_GENERATE, doc)).toContain('"allowWhenHelpful"')
  })
})
