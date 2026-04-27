import { describe, expect, it } from 'vitest'

import { ARK_IMAGE_RATIOS, ARK_VIDEO_SPECS } from '@/lib/ai-providers/ark/models'
import { FAL_IMAGE_RESOLUTIONS, FAL_VIDEO_MODEL_IDS } from '@/lib/ai-providers/fal/models'
import { MINIMAX_VIDEO_SPECS } from '@/lib/ai-providers/minimax/models'
import { OPENAI_IMAGE_SIZES } from '@/lib/ai-providers/openai-compatible/models'
import { VIDU_VIDEO_SPECS } from '@/lib/ai-providers/vidu/models'

import { ARK_VIDEO_SPECS as ARK_VIDEO_SPECS_ADAPTER } from '@/lib/ai-providers/adapters/models/ark'
import { FAL_VIDEO_MODEL_IDS as FAL_VIDEO_MODEL_IDS_ADAPTER } from '@/lib/ai-providers/adapters/models/fal'
import { MINIMAX_VIDEO_SPECS as MINIMAX_VIDEO_SPECS_ADAPTER } from '@/lib/ai-providers/adapters/models/minimax'
import { VIDU_VIDEO_SPECS as VIDU_VIDEO_SPECS_ADAPTER } from '@/lib/ai-providers/adapters/models/vidu'

describe('Step 1: move adapter model constants into provider models.ts', () => {
  it('keeps constants available via provider models.ts', () => {
    expect(ARK_IMAGE_RATIOS).toContain('1:1')
    expect(ARK_VIDEO_SPECS['doubao-seedance-2-0-260128']?.durationMax).toBe(15)

    expect(FAL_IMAGE_RESOLUTIONS).toContain('4K')
    expect(FAL_VIDEO_MODEL_IDS.has('fal-wan25')).toBe(true)

    expect(MINIMAX_VIDEO_SPECS['minimax-hailuo-02']?.supportsFirstLastFrame).toBe(true)
    expect(VIDU_VIDEO_SPECS['viduq3-pro']?.supportsGenerateAudio).toBe(true)

    expect(OPENAI_IMAGE_SIZES).toContain('1024x1024')
  })

  it('keeps adapter exports wired via re-export', () => {
    expect(ARK_VIDEO_SPECS_ADAPTER).toBe(ARK_VIDEO_SPECS)
    expect(FAL_VIDEO_MODEL_IDS_ADAPTER).toBe(FAL_VIDEO_MODEL_IDS)
    expect(MINIMAX_VIDEO_SPECS_ADAPTER).toBe(MINIMAX_VIDEO_SPECS)
    expect(VIDU_VIDEO_SPECS_ADAPTER).toBe(VIDU_VIDEO_SPECS)
  })
})

