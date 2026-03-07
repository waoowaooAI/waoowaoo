import { beforeEach, describe, expect, it, vi } from 'vitest'

const resolveModelSelectionMock = vi.hoisted(() =>
  vi.fn<typeof import('@/lib/api-config').resolveModelSelection>(async () => ({
    provider: 'google',
    modelId: 'gemini-3.1',
    modelKey: 'google::gemini-3.1',
    mediaType: 'image',
  })),
)
const getProviderConfigMock = vi.hoisted(() =>
  vi.fn<typeof import('@/lib/api-config').getProviderConfig>(async () => ({
    id: 'google',
    name: 'Google',
    apiKey: 'google-key',
    apiMode: undefined,
    gatewayRoute: undefined,
  })),
)

const generateImageViaOpenAICompatMock = vi.hoisted(() => vi.fn(async () => ({ success: true, imageUrl: 'compat-image' })))
const generateVideoViaOpenAICompatMock = vi.hoisted(() => vi.fn(async () => ({ success: true, videoUrl: 'compat-video' })))
const generateImageViaOpenAICompatTemplateMock = vi.hoisted(() => vi.fn(async () => ({ success: true, imageUrl: 'compat-template-image' })))
const generateVideoViaOpenAICompatTemplateMock = vi.hoisted(() => vi.fn(async () => ({ success: true, videoUrl: 'compat-template-video' })))
const resolveModelGatewayRouteMock = vi.hoisted(() => vi.fn(() => 'official'))

const imageGeneratorGenerateMock = vi.hoisted(() => vi.fn(async () => ({ success: true, imageUrl: 'official-image' })))
const videoGeneratorGenerateMock = vi.hoisted(() => vi.fn(async () => ({ success: true, videoUrl: 'official-video' })))
const audioGeneratorGenerateMock = vi.hoisted(() => vi.fn(async () => ({ success: true, audioUrl: 'audio' })))

const createImageGeneratorMock = vi.hoisted(() => vi.fn(() => ({ generate: imageGeneratorGenerateMock })))
const createVideoGeneratorMock = vi.hoisted(() => vi.fn(() => ({ generate: videoGeneratorGenerateMock })))
const createAudioGeneratorMock = vi.hoisted(() => vi.fn(() => ({ generate: audioGeneratorGenerateMock })))
const generateBailianImageMock = vi.hoisted(() => vi.fn(async () => ({ success: true, imageUrl: 'bailian-image' })))
const generateBailianVideoMock = vi.hoisted(() => vi.fn(async () => ({ success: true, videoUrl: 'bailian-video' })))
const generateBailianAudioMock = vi.hoisted(() => vi.fn(async () => ({ success: true, audioUrl: 'bailian-audio' })))
const generateSiliconFlowImageMock = vi.hoisted(() => vi.fn(async () => ({ success: true, imageUrl: 'siliconflow-image' })))
const generateSiliconFlowVideoMock = vi.hoisted(() => vi.fn(async () => ({ success: true, videoUrl: 'siliconflow-video' })))
const generateSiliconFlowAudioMock = vi.hoisted(() => vi.fn(async () => ({ success: true, audioUrl: 'siliconflow-audio' })))

vi.mock('@/lib/api-config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-config')>()
  return {
    ...actual,
    resolveModelSelection: resolveModelSelectionMock,
    getProviderConfig: getProviderConfigMock,
  }
})

vi.mock('@/lib/model-gateway', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/model-gateway')>()
  return {
    ...actual,
    generateImageViaOpenAICompat: generateImageViaOpenAICompatMock,
    generateVideoViaOpenAICompat: generateVideoViaOpenAICompatMock,
    generateImageViaOpenAICompatTemplate: generateImageViaOpenAICompatTemplateMock,
    generateVideoViaOpenAICompatTemplate: generateVideoViaOpenAICompatTemplateMock,
    resolveModelGatewayRoute: resolveModelGatewayRouteMock,
  }
})

vi.mock('@/lib/generators/factory', () => ({
  createImageGenerator: createImageGeneratorMock,
  createVideoGenerator: createVideoGeneratorMock,
  createAudioGenerator: createAudioGeneratorMock,
}))

vi.mock('@/lib/providers/bailian', () => ({
  generateBailianImage: generateBailianImageMock,
  generateBailianVideo: generateBailianVideoMock,
  generateBailianAudio: generateBailianAudioMock,
}))

vi.mock('@/lib/providers/siliconflow', () => ({
  generateSiliconFlowImage: generateSiliconFlowImageMock,
  generateSiliconFlowVideo: generateSiliconFlowVideoMock,
  generateSiliconFlowAudio: generateSiliconFlowAudioMock,
}))

import { generateAudio, generateImage, generateVideo } from '@/lib/generator-api'

describe('generator-api gateway routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolveModelGatewayRouteMock.mockReset()
    resolveModelGatewayRouteMock.mockReturnValue('official')
    getProviderConfigMock.mockResolvedValue({
      id: 'google',
      name: 'Google',
      apiKey: 'google-key',
      apiMode: undefined,
      gatewayRoute: undefined,
    })
  })

  it('routes openai-compatible image requests to openai-compat gateway', async () => {
    resolveModelSelectionMock.mockResolvedValueOnce({
      provider: 'openai-compatible:oa-1',
      modelId: 'gpt-image-1',
      modelKey: 'openai-compatible:oa-1::gpt-image-1',
      mediaType: 'image',
      compatMediaTemplate: {
        version: 1,
        mediaType: 'image',
        mode: 'sync',
        create: { method: 'POST', path: '/v1/images/generations' },
        response: { outputUrlPath: 'data[0].url' },
      },
    })
    resolveModelGatewayRouteMock.mockReturnValueOnce('openai-compat')

    const result = await generateImage('user-1', 'openai-compatible:oa-1::gpt-image-1', 'draw cat', {
      size: '1024x1024',
    })

    expect(generateImageViaOpenAICompatTemplateMock).toHaveBeenCalledTimes(1)
    expect(createImageGeneratorMock).not.toHaveBeenCalled()
    expect(result).toEqual({ success: true, imageUrl: 'compat-template-image' })
  })

  it('routes official image requests to provider generator', async () => {
    resolveModelSelectionMock.mockResolvedValueOnce({
      provider: 'google',
      modelId: 'imagen-4.0',
      modelKey: 'google::imagen-4.0',
      mediaType: 'image',
    })
    resolveModelGatewayRouteMock.mockReturnValueOnce('official')

    const result = await generateImage('user-1', 'google::imagen-4.0', 'draw house')

    expect(createImageGeneratorMock).toHaveBeenCalledWith('google', 'imagen-4.0')
    expect(generateImageViaOpenAICompatMock).not.toHaveBeenCalled()
    expect(result).toEqual({ success: true, imageUrl: 'official-image' })
  })

  it('routes gemini-compatible image to official generator', async () => {
    resolveModelSelectionMock.mockResolvedValueOnce({
      provider: 'gemini-compatible:gm-1',
      modelId: 'gemini-2.5-flash-image-preview',
      modelKey: 'gemini-compatible:gm-1::gemini-2.5-flash-image-preview',
      mediaType: 'image',
    })
    getProviderConfigMock.mockResolvedValueOnce({
      id: 'gemini-compatible:gm-1',
      name: 'Gemini Compatible',
      apiKey: 'gm-key',
      baseUrl: 'https://gm.test',
      apiMode: 'gemini-sdk',
      gatewayRoute: 'official',
    })

    const result = await generateImage(
      'user-1',
      'gemini-compatible:gm-1::gemini-2.5-flash-image-preview',
      'draw cat',
      { aspectRatio: '3:4' },
    )

    expect(createImageGeneratorMock).toHaveBeenCalledWith('gemini-compatible:gm-1', 'gemini-2.5-flash-image-preview')
    expect(generateImageViaOpenAICompatMock).not.toHaveBeenCalled()
    expect(result).toEqual({ success: true, imageUrl: 'official-image' })
  })

  it('routes openai-compatible video requests to openai-compat gateway', async () => {
    resolveModelSelectionMock.mockResolvedValueOnce({
      provider: 'openai-compatible:oa-1',
      modelId: 'sora-2',
      modelKey: 'openai-compatible:oa-1::sora-2',
      mediaType: 'video',
      compatMediaTemplate: {
        version: 1,
        mediaType: 'video',
        mode: 'async',
        create: { method: 'POST', path: '/v1/videos/generations' },
        response: { taskIdPath: 'id' },
      },
    })
    resolveModelGatewayRouteMock.mockReturnValueOnce('openai-compat')

    const result = await generateVideo(
      'user-1',
      'openai-compatible:oa-1::sora-2',
      'https://example.com/source.png',
      { prompt: 'animate' },
    )

    expect(generateVideoViaOpenAICompatTemplateMock).toHaveBeenCalledTimes(1)
    expect(createVideoGeneratorMock).not.toHaveBeenCalled()
    expect(result).toEqual({ success: true, videoUrl: 'compat-template-video' })
  })

  it('routes gemini-compatible video to official provider generator', async () => {
    resolveModelSelectionMock.mockResolvedValueOnce({
      provider: 'gemini-compatible:gm-1',
      modelId: 'veo-3.1-generate-preview',
      modelKey: 'gemini-compatible:gm-1::veo-3.1-generate-preview',
      mediaType: 'video',
    })
    resolveModelGatewayRouteMock.mockReturnValueOnce('official')

    const result = await generateVideo('user-1', 'gemini-compatible:gm-1::veo-3.1-generate-preview', 'https://example.com/source.png')

    expect(createVideoGeneratorMock).toHaveBeenCalledWith('gemini-compatible:gm-1')
    expect(generateVideoViaOpenAICompatMock).not.toHaveBeenCalled()
    expect(result).toEqual({ success: true, videoUrl: 'official-video' })
  })

  it('routes official video requests to provider generator', async () => {
    resolveModelSelectionMock.mockResolvedValueOnce({
      provider: 'fal',
      modelId: 'kling',
      modelKey: 'fal::kling',
      mediaType: 'video',
    })
    resolveModelGatewayRouteMock.mockReturnValueOnce('official')

    const result = await generateVideo('user-1', 'fal::kling', 'https://example.com/source.png')

    expect(createVideoGeneratorMock).toHaveBeenCalledWith('fal')
    expect(generateVideoViaOpenAICompatMock).not.toHaveBeenCalled()
    expect(result).toEqual({ success: true, videoUrl: 'official-video' })
  })

  it('keeps audio generation on provider generator path', async () => {
    resolveModelSelectionMock.mockResolvedValueOnce({
      provider: 'fal',
      modelId: 'tts-1',
      modelKey: 'fal::tts-1',
      mediaType: 'audio',
    })

    const result = await generateAudio('user-1', 'fal::tts-1', 'hello')

    expect(createAudioGeneratorMock).toHaveBeenCalledWith('fal')
    expect(result).toEqual({ success: true, audioUrl: 'audio' })
  })

  it('routes bailian image generation to official provider adapter', async () => {
    resolveModelSelectionMock.mockResolvedValueOnce({
      provider: 'bailian',
      modelId: 'wanx-image',
      modelKey: 'bailian::wanx-image',
      mediaType: 'image',
    })
    getProviderConfigMock.mockResolvedValueOnce({
      id: 'bailian',
      name: 'Bailian',
      apiKey: 'bl-key',
      gatewayRoute: 'official',
      apiMode: undefined,
    })

    const result = await generateImage('user-1', 'bailian::wanx-image', 'draw sky')

    expect(generateBailianImageMock).toHaveBeenCalledTimes(1)
    expect(generateImageViaOpenAICompatMock).not.toHaveBeenCalled()
    expect(createImageGeneratorMock).not.toHaveBeenCalled()
    expect(result).toEqual({ success: true, imageUrl: 'bailian-image' })
  })

  it('routes siliconflow video generation to official provider adapter', async () => {
    resolveModelSelectionMock.mockResolvedValueOnce({
      provider: 'siliconflow',
      modelId: 'sf-video',
      modelKey: 'siliconflow::sf-video',
      mediaType: 'video',
    })
    getProviderConfigMock.mockResolvedValueOnce({
      id: 'siliconflow',
      name: 'SiliconFlow',
      apiKey: 'sf-key',
      gatewayRoute: 'official',
      apiMode: undefined,
    })

    const result = await generateVideo('user-1', 'siliconflow::sf-video', 'https://example.com/source.png', {
      prompt: 'animate',
    })

    expect(generateSiliconFlowVideoMock).toHaveBeenCalledTimes(1)
    expect(generateVideoViaOpenAICompatMock).not.toHaveBeenCalled()
    expect(createVideoGeneratorMock).not.toHaveBeenCalled()
    expect(result).toEqual({ success: true, videoUrl: 'siliconflow-video' })
  })

  it('routes bailian audio generation to official provider adapter', async () => {
    resolveModelSelectionMock.mockResolvedValueOnce({
      provider: 'bailian',
      modelId: 'bailian-tts',
      modelKey: 'bailian::bailian-tts',
      mediaType: 'audio',
    })

    const result = await generateAudio('user-1', 'bailian::bailian-tts', 'hello')

    expect(generateBailianAudioMock).toHaveBeenCalledTimes(1)
    expect(createAudioGeneratorMock).not.toHaveBeenCalled()
    expect(result).toEqual({ success: true, audioUrl: 'bailian-audio' })
  })
})
