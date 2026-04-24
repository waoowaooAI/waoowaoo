import { createAudioGenerator, createImageGenerator, createVideoGenerator } from '@/lib/ai-providers/adapters/media/generators/factory'
import type { GenerateResult } from '@/lib/ai-providers/adapters/media/generators/base'
import { getProviderConfig, getProviderKey, type ModelSelection, type ProviderConfig } from '@/lib/api-config'
import {
  generateImageViaOpenAICompat,
  generateImageViaOpenAICompatTemplate,
  generateVideoViaOpenAICompat,
  generateVideoViaOpenAICompatTemplate,
} from '@/lib/ai-providers/adapters/openai-compatible/index'
import { resolveAiGatewayRoute } from '@/lib/ai-registry/gateway-route'
import { generateBailianAudio, generateBailianImage, generateBailianVideo } from '@/lib/ai-providers/bailian'
import { generateSiliconFlowAudio, generateSiliconFlowImage, generateSiliconFlowVideo } from '@/lib/ai-providers/siliconflow'

const OFFICIAL_ONLY_PROVIDER_KEYS = new Set(['bailian', 'siliconflow'])

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

function aspectRatioToOpenAISize(aspectRatio: string | undefined): string | undefined {
  if (!aspectRatio) return undefined
  const ratio = aspectRatio.trim()
  const mapping: Record<string, string> = {
    '1:1': '1024x1024',
    '16:9': '1792x1024',
    '9:16': '1024x1792',
    '3:2': '1536x1024',
    '2:3': '1024x1536',
  }
  return mapping[ratio] || undefined
}

function resolveGatewayRoute(input: {
  providerKey: string
  selection: ModelSelection
  providerConfig: ProviderConfig
}) {
  const defaultGatewayRoute = resolveAiGatewayRoute(input.selection.provider)
  if (input.providerKey === 'gemini-compatible') {
    return input.providerConfig.apiMode === 'openai-official' ? 'openai-compat' : 'official'
  }
  return OFFICIAL_ONLY_PROVIDER_KEYS.has(input.providerKey)
    ? 'official'
    : (input.providerConfig.gatewayRoute || defaultGatewayRoute)
}

export async function executeImageGeneration(input: {
  userId: string
  selection: ModelSelection
  prompt: string
  options?: ImageOptions
}): Promise<GenerateResult> {
  const providerConfig = await getProviderConfig(input.userId, input.selection.provider)
  const providerKey = getProviderKey(input.selection.provider).toLowerCase()
  if (providerKey === 'bailian') {
    return await generateBailianImage({
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
  if (providerKey === 'siliconflow') {
    return await generateSiliconFlowImage({
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

  const gatewayRoute = resolveGatewayRoute({ providerKey, selection: input.selection, providerConfig })
  const { referenceImages, ...generatorOptions } = input.options || {}
  if (gatewayRoute === 'openai-compat') {
    const compatTemplate = input.selection.compatMediaTemplate
    if (providerKey === 'openai-compatible' && !compatTemplate) {
      throw new Error(`MODEL_COMPAT_MEDIA_TEMPLATE_REQUIRED: ${input.selection.modelKey}`)
    }
    if (compatTemplate) {
      return await generateImageViaOpenAICompatTemplate({
        userId: input.userId,
        providerId: input.selection.provider,
        modelId: input.selection.modelId,
        modelKey: input.selection.modelKey,
        prompt: input.prompt,
        referenceImages,
        options: {
          ...generatorOptions,
          provider: input.selection.provider,
          modelId: input.selection.modelId,
          modelKey: input.selection.modelKey,
        },
        profile: 'openai-compatible',
        template: compatTemplate,
      })
    }

    let openaiCompatOptions = { ...generatorOptions }
    if (openaiCompatOptions.aspectRatio) {
      const mappedSize = aspectRatioToOpenAISize(openaiCompatOptions.aspectRatio)
      if (mappedSize && !openaiCompatOptions.size) {
        openaiCompatOptions = { ...openaiCompatOptions, size: mappedSize }
      }
      delete openaiCompatOptions.aspectRatio
    }

    return await generateImageViaOpenAICompat({
      userId: input.userId,
      providerId: input.selection.provider,
      modelId: input.selection.modelId,
      prompt: input.prompt,
      referenceImages,
      options: {
        ...openaiCompatOptions,
        provider: input.selection.provider,
        modelId: input.selection.modelId,
        modelKey: input.selection.modelKey,
      },
      profile: 'openai-compatible',
    })
  }

  const generator = createImageGenerator(input.selection.provider, input.selection.modelId)
  return await generator.generate({
    userId: input.userId,
    prompt: input.prompt,
    referenceImages,
    options: {
      ...generatorOptions,
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
  const providerKey = getProviderKey(input.selection.provider).toLowerCase()
  if (providerKey === 'bailian') {
    return await generateBailianVideo({
      userId: input.userId,
      imageUrl: input.imageUrl,
      prompt: input.options?.prompt,
      options: {
        ...(input.options || {}),
        provider: input.selection.provider,
        modelId: input.selection.modelId,
        modelKey: input.selection.modelKey,
      },
    })
  }
  if (providerKey === 'siliconflow') {
    return await generateSiliconFlowVideo({
      userId: input.userId,
      imageUrl: input.imageUrl,
      prompt: input.options?.prompt,
      options: {
        ...(input.options || {}),
        provider: input.selection.provider,
        modelId: input.selection.modelId,
        modelKey: input.selection.modelKey,
      },
    })
  }

  const providerConfig = await getProviderConfig(input.userId, input.selection.provider)
  const gatewayRoute = resolveGatewayRoute({ providerKey, selection: input.selection, providerConfig })
  const { prompt, ...providerOptions } = input.options || {}
  if (gatewayRoute === 'openai-compat') {
    const compatTemplate = input.selection.compatMediaTemplate
    if (providerKey === 'openai-compatible' && !compatTemplate) {
      throw new Error(`MODEL_COMPAT_MEDIA_TEMPLATE_REQUIRED: ${input.selection.modelKey}`)
    }
    if (compatTemplate) {
      return await generateVideoViaOpenAICompatTemplate({
        userId: input.userId,
        providerId: input.selection.provider,
        modelId: input.selection.modelId,
        modelKey: input.selection.modelKey,
        imageUrl: input.imageUrl,
        prompt: prompt || '',
        options: {
          ...providerOptions,
          provider: input.selection.provider,
          modelId: input.selection.modelId,
          modelKey: input.selection.modelKey,
        },
        profile: 'openai-compatible',
        template: compatTemplate,
      })
    }

    return await generateVideoViaOpenAICompat({
      userId: input.userId,
      providerId: input.selection.provider,
      modelId: input.selection.modelId,
      modelKey: input.selection.modelKey,
      imageUrl: input.imageUrl,
      prompt: prompt || '',
      options: {
        ...providerOptions,
        provider: input.selection.provider,
        modelId: input.selection.modelId,
        modelKey: input.selection.modelKey,
      },
      profile: 'openai-compatible',
    })
  }

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
  const providerKey = getProviderKey(input.selection.provider).toLowerCase()
  if (providerKey === 'bailian') {
    return await generateBailianAudio({
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
  if (providerKey === 'siliconflow') {
    return await generateSiliconFlowAudio({
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
