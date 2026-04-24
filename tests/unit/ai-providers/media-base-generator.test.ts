import { describe, expect, it } from 'vitest'
import {
  BaseImageGenerator,
  BaseVideoGenerator,
  type GenerateResult,
  type ImageGenerateParams,
  type VideoGenerateParams,
} from '@/lib/ai-providers/adapters/media/generators/base'

class FailingImageGenerator extends BaseImageGenerator {
  calls = 0

  protected async doGenerate(_params: ImageGenerateParams): Promise<GenerateResult> {
    this.calls += 1
    throw new Error('image provider failed')
  }
}

class FailingVideoGenerator extends BaseVideoGenerator {
  calls = 0

  protected async doGenerate(_params: VideoGenerateParams): Promise<GenerateResult> {
    this.calls += 1
    throw new Error('video provider failed')
  }
}

describe('media base generators', () => {
  it('does not retry image provider failures inside generator layer', async () => {
    const generator = new FailingImageGenerator()

    const result = await generator.generate({ userId: 'user-1', prompt: 'draw a cat' })

    expect(generator.calls).toBe(1)
    expect(result).toEqual({ success: false, error: 'image provider failed' })
  })

  it('does not retry video provider failures inside generator layer', async () => {
    const generator = new FailingVideoGenerator()

    const result = await generator.generate({ userId: 'user-1', imageUrl: 'https://example.test/a.png' })

    expect(generator.calls).toBe(1)
    expect(result).toEqual({ success: false, error: 'video provider failed' })
  })
})
