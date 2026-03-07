import { BaseVideoGenerator, type GenerateResult, type VideoGenerateParams } from '../base'
import { generateVideoViaOpenAICompat } from '@/lib/model-gateway'

export class OpenAICompatibleVideoGenerator extends BaseVideoGenerator {
  private readonly providerId?: string

  constructor(providerId?: string) {
    super()
    this.providerId = providerId
  }

  protected async doGenerate(params: VideoGenerateParams): Promise<GenerateResult> {
    const { userId, imageUrl, prompt = '', options = {} } = params
    return await generateVideoViaOpenAICompat({
      userId,
      providerId: this.providerId || 'openai-compatible',
      modelId: typeof options.modelId === 'string' ? options.modelId : undefined,
      imageUrl,
      prompt,
      options,
      profile: 'openai-compatible',
    })
  }
}
