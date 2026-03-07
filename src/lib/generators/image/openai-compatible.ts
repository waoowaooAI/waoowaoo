import { BaseImageGenerator, type GenerateResult, type ImageGenerateParams } from '../base'
import { generateImageViaOpenAICompat } from '@/lib/model-gateway'

export class OpenAICompatibleImageGenerator extends BaseImageGenerator {
  private readonly modelId?: string
  private readonly providerId?: string

  constructor(modelId?: string, providerId?: string) {
    super()
    this.modelId = modelId
    this.providerId = providerId
  }

  protected async doGenerate(params: ImageGenerateParams): Promise<GenerateResult> {
    const { userId, prompt, referenceImages = [], options = {} } = params
    return await generateImageViaOpenAICompat({
      userId,
      providerId: this.providerId || 'openai-compatible',
      modelId: this.modelId,
      prompt,
      referenceImages,
      options,
      profile: 'openai-compatible',
    })
  }
}
