import type { AiProviderVideoExecutionContext } from '@/lib/ai-providers/runtime-types'
import type { SiliconFlowGenerateRequestOptions } from './types'
import { assertSiliconFlowOfficialModelSupported } from './models'

export interface SiliconFlowVideoGenerateParams {
  userId: string
  imageUrl: string
  prompt?: string
  options: SiliconFlowGenerateRequestOptions
}

function assertRegistered(modelId: string): void {
  assertSiliconFlowOfficialModelSupported('video', modelId)
}

export async function generateSiliconFlowVideo(params: SiliconFlowVideoGenerateParams): Promise<never> {
  assertRegistered(params.options.modelId)
  throw new Error('OFFICIAL_PROVIDER_NOT_IMPLEMENTED: siliconflow video')
}

export async function executeSiliconFlowVideoGeneration(input: AiProviderVideoExecutionContext) {
  return await generateSiliconFlowVideo({
    userId: input.userId,
    imageUrl: input.imageUrl,
    prompt: input.options?.prompt,
    options: {
      ...(input.options || {}),
      provider: input.selection.provider,
      modelId: input.selection.modelId,
      modelKey: input.selection.modelKey,
    } as SiliconFlowGenerateRequestOptions,
  })
}
