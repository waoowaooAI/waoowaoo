import type { GenerateResult } from '@/lib/ai-providers/adapters/media/generators/base'
import { createAudioGenerator, createImageGenerator, createVideoGenerator } from '@/lib/ai-providers/adapters/media/generators/factory'
import {
  resolveRegisteredAiProvider,
  resolveRegisteredMediaGatewayRoute,
  shouldUseRegisteredImageExecution,
  shouldUseRegisteredVideoExecution,
} from '@/lib/ai-providers'
import { getProviderConfig, getProviderKey, type ModelSelection } from '@/lib/api-config'

type ImageOptions = {
  referenceImages?: string[]
  aspectRatio?: string
  resolution?: string
  outputFormat?: string
  keepOriginalAspectRatio?: boolean
  size?: string
}

type VideoOptions = {
  prompt?: string
  duration?: number
  fps?: number
  resolution?: string
  aspectRatio?: string
  generateAudio?: boolean
  lastFrameImageUrl?: string
  [key: string]: string | number | boolean | undefined
}

type AudioOptions = {
  voice?: string
  rate?: number
}

export async function executeImageGeneration(input: {
  userId: string
  selection: ModelSelection
  prompt: string
  options?: ImageOptions
}): Promise<GenerateResult> {
  const providerConfig = await getProviderConfig(input.userId, input.selection.provider)
  const gatewayRoute = resolveRegisteredMediaGatewayRoute({
    providerId: input.selection.provider,
    providerConfig,
  })
  const provider = resolveRegisteredAiProvider(input.selection.provider)
  if (shouldUseRegisteredImageExecution({ providerId: input.selection.provider, gatewayRoute })) {
    if (!provider.executeImage) {
      throw new Error(`UNSUPPORTED_IMAGE_PROVIDER: ${getProviderKey(input.selection.provider).toLowerCase()}`)
    }
    return await provider.executeImage(input)
  }

  const generator = createImageGenerator(input.selection.provider, input.selection.modelId)
  return await generator.generate({
    userId: input.userId,
    prompt: input.prompt,
    referenceImages: input.options?.referenceImages,
    options: {
      ...(input.options || {}),
      provider: input.selection.provider,
      modelId: input.selection.modelId,
      modelKey: input.selection.modelKey,
    },
  })
}

export async function executeVideoGeneration(input: {
  userId: string
  selection: ModelSelection
  imageUrl: string
  options?: VideoOptions
}): Promise<GenerateResult> {
  const providerConfig = await getProviderConfig(input.userId, input.selection.provider)
  const gatewayRoute = resolveRegisteredMediaGatewayRoute({
    providerId: input.selection.provider,
    providerConfig,
  })
  const provider = resolveRegisteredAiProvider(input.selection.provider)
  if (shouldUseRegisteredVideoExecution({ providerId: input.selection.provider, gatewayRoute })) {
    if (!provider.executeVideo) {
      throw new Error(`UNSUPPORTED_VIDEO_PROVIDER: ${getProviderKey(input.selection.provider).toLowerCase()}`)
    }
    return await provider.executeVideo(input)
  }

  const { prompt, ...providerOptions } = input.options || {}
  const generator = createVideoGenerator(input.selection.provider)
  return await generator.generate({
    userId: input.userId,
    imageUrl: input.imageUrl,
    prompt,
    options: {
      ...providerOptions,
      provider: input.selection.provider,
      modelId: input.selection.modelId,
      modelKey: input.selection.modelKey,
    },
  })
}

export async function executeAudioGeneration(input: {
  userId: string
  selection: ModelSelection
  text: string
  options?: AudioOptions
}): Promise<GenerateResult> {
  const provider = resolveRegisteredAiProvider(input.selection.provider)
  if (provider.executeAudio) {
    return await provider.executeAudio(input)
  }

  const generator = createAudioGenerator(input.selection.provider)
  return await generator.generate({
    userId: input.userId,
    text: input.text,
    voice: input.options?.voice,
    rate: input.options?.rate,
    options: {
      provider: input.selection.provider,
      modelId: input.selection.modelId,
      modelKey: input.selection.modelKey,
    },
  })
}
