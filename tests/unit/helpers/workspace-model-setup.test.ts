import { describe, expect, it } from 'vitest'
import { hasConfiguredAnalysisModel, readConfiguredAnalysisModel, shouldGuideToModelSetup } from '@/lib/workspace/model-setup'

describe('workspace model setup guidance', () => {
  it('有 analysisModel -> 不需要引导设置', () => {
    const payload = {
      preference: {
        analysisModel: 'openai::gpt-4.1',
      },
    }

    expect(hasConfiguredAnalysisModel(payload)).toBe(true)
    expect(readConfiguredAnalysisModel(payload)).toBe('openai::gpt-4.1')
    expect(shouldGuideToModelSetup(payload)).toBe(false)
  })

  it('analysisModel 为空 -> 需要引导设置', () => {
    const payload = {
      preference: {
        analysisModel: '   ',
      },
    }

    expect(hasConfiguredAnalysisModel(payload)).toBe(false)
    expect(readConfiguredAnalysisModel(payload)).toBeNull()
    expect(shouldGuideToModelSetup(payload)).toBe(true)
  })

  it('payload 非法 -> 需要引导设置', () => {
    expect(hasConfiguredAnalysisModel(null)).toBe(false)
    expect(readConfiguredAnalysisModel(null)).toBeNull()
    expect(hasConfiguredAnalysisModel({})).toBe(false)
    expect(readConfiguredAnalysisModel({})).toBeNull()
    expect(shouldGuideToModelSetup({})).toBe(true)
  })
})
