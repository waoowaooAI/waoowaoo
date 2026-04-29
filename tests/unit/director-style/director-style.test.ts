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
    expect(resolveDirectorStyleRequirements(AI_PROMPT_IDS.CHARACTER_ANALYZE, doc)).toContain('"character"')
    expect(resolveDirectorStyleRequirements(AI_PROMPT_IDS.CHARACTER_ANALYZE, doc)).toContain('"temperament"')
    expect(resolveDirectorStyleRequirements(AI_PROMPT_IDS.PANEL_IMAGE_GENERATE, doc)).toContain('"image"')
    expect(resolveDirectorStyleRequirements(AI_PROMPT_IDS.PANEL_IMAGE_GENERATE, doc)).toContain('"negativePrompt"')
    expect(resolveDirectorStyleRequirements(AI_PROMPT_IDS.STORYBOARD_REFINE_DETAIL, doc)).toContain('"storyboardDetail"')
    expect(resolveDirectorStyleRequirements(AI_PROMPT_IDS.STORYBOARD_REFINE_DETAIL, doc)).toContain('"video"')
    expect(resolveDirectorStyleRequirements(AI_PROMPT_IDS.STORYBOARD_REFINE_DETAIL, doc)).toContain('"cameraMotion"')
  })
})
