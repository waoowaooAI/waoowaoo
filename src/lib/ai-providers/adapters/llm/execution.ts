import OpenAI from 'openai'
import { generateText, type ModelMessage } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { GoogleGenAI } from '@google/genai'
import { getInternalBaseUrl } from '@/lib/env'
import {
  runOpenAICompatChatCompletion,
  runOpenAICompatResponsesCompletion,
} from '@/lib/ai-providers/adapters/openai-compatible/index'
import { resolveAiGatewayRoute } from '@/lib/ai-registry/gateway-route'
import { getCompletionParts } from '@/lib/llm/completion-parts'
import { buildOpenAIChatCompletion } from '@/lib/ai-providers/llm/openai-compat'
import { extractGoogleParts, extractGoogleUsage } from '@/lib/ai-providers/llm/google'
import { extractGoogleText } from '@/lib/ai-providers/llm/google'
import { completeBailianLlm } from '@/lib/ai-providers/bailian'
import { completeSiliconFlowLlm } from '@/lib/ai-providers/siliconflow'
import type { ProviderConfig } from '@/lib/api-config'
import type { AiLlmExecutionInput, AiLlmExecutionResult } from '@/lib/ai-registry/types'
import {
  buildReasoningAwareContent,
  getConversationMessages,
  getSystemPrompt,
  mapReasoningEffort,
} from '@/lib/llm/utils'
import { completionUsageSummary } from '@/lib/llm/runtime-shared'
import { shouldUseOpenAIReasoningProviderOptions } from '@/lib/llm/reasoning-capability'

const OFFICIAL_ONLY_PROVIDER_KEYS = new Set(['bailian', 'siliconflow'])

type LlmProviderRunner = (input: AiLlmExecutionInput) => Promise<AiLlmExecutionResult>
type VisionProviderRunner = (input: AiVisionExecutionInput) => Promise<AiLlmExecutionResult>

type AiVisionExecutionInput = {
  userId: string
  providerKey: string
  selection: AiLlmExecutionInput['selection']
  providerConfig: AiLlmExecutionInput['providerConfig']
  textPrompt: string
  imageUrls: string[]
  temperature: number
  reasoning: boolean
}

type GoogleVisionPart = { inlineData: { mimeType: string; data: string } } | { text: string }
type ArkVisionContentItem = { type: 'input_image'; image_url: string } | { type: 'input_text'; text: string }
type OpenAiVisionContentItem = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }

function buildResult(input: {
  completion: OpenAI.Chat.Completions.ChatCompletion
  logProvider: string
  text: string
  reasoning: string
  usage?: { promptTokens: number; completionTokens: number } | null
  successDetails?: Record<string, unknown>
}): AiLlmExecutionResult {
  return {
    completion: input.completion,
    logProvider: input.logProvider,
    text: input.text,
    reasoning: input.reasoning,
    usage: input.usage ?? completionUsageSummary(input.completion),
    successDetails: input.successDetails,
  }
}

async function runOpenAiCompatibleProtocol(input: AiLlmExecutionInput): Promise<AiLlmExecutionResult> {
  if (input.providerKey !== 'openai-compatible') {
    throw new Error(`OPENAI_COMPAT_PROVIDER_UNSUPPORTED: ${input.selection.provider}`)
  }
  if (!input.selection.llmProtocol) {
    throw new Error(`MODEL_LLM_PROTOCOL_REQUIRED: ${input.selection.modelKey}`)
  }

  const completion = input.selection.llmProtocol === 'responses'
    ? await runOpenAICompatResponsesCompletion({
      userId: input.userId,
      providerId: input.selection.provider,
      modelId: input.selection.modelId,
      messages: input.messages,
      temperature: input.temperature,
    })
    : await runOpenAICompatChatCompletion({
      userId: input.userId,
      providerId: input.selection.provider,
      modelId: input.selection.modelId,
      messages: input.messages,
      temperature: input.temperature,
    })
  const completionParts = getCompletionParts(completion)
  const compatEngine = input.selection.llmProtocol === 'responses'
    ? 'openai_compat_responses'
    : 'openai_compat_chat_completions'
  return buildResult({
    completion,
    logProvider: compatEngine,
    text: completionParts.text,
    reasoning: completionParts.reasoning,
    successDetails: { llmProtocol: input.selection.llmProtocol },
  })
}

async function runGoogleLlm(input: AiLlmExecutionInput): Promise<AiLlmExecutionResult> {
  const googleAiOptions = input.providerConfig.baseUrl
    ? { apiKey: input.providerConfig.apiKey, httpOptions: { baseUrl: input.providerConfig.baseUrl } }
    : { apiKey: input.providerConfig.apiKey }
  const ai = new GoogleGenAI(googleAiOptions)

  const systemParts = input.messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .filter(Boolean)
  const contents = input.messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    }))

  const systemInstruction = systemParts.length > 0
    ? { parts: [{ text: systemParts.join('\n') }] }
    : undefined
  const supportsThinkingLevel = input.selection.modelId.startsWith('gemini-3')
  const thinkingConfig = input.reasoning && supportsThinkingLevel
    ? { thinkingLevel: input.reasoningEffort, includeThoughts: true }
    : undefined

  const googleRequest = {
    model: input.selection.modelId,
    contents,
    config: {
      temperature: input.temperature,
      ...(systemInstruction ? { systemInstruction } : {}),
      ...(thinkingConfig ? { thinkingConfig } : {}),
    },
  }
  const response = await ai.models.generateContent(
    googleRequest as unknown as Parameters<typeof ai.models.generateContent>[0],
  )

  const googleParts = extractGoogleParts(response, true)
  const usage = extractGoogleUsage(response)
  const completion = buildOpenAIChatCompletion(
    input.selection.modelId,
    buildReasoningAwareContent(googleParts.text, googleParts.reasoning),
    usage,
  )
  return buildResult({
    completion,
    logProvider: input.providerKey,
    text: googleParts.text,
    reasoning: googleParts.reasoning,
    usage,
  })
}

async function runBailianLlm(input: AiLlmExecutionInput): Promise<AiLlmExecutionResult> {
  const completion = await completeBailianLlm({
    modelId: input.selection.modelId,
    messages: input.messages,
    apiKey: input.providerConfig.apiKey,
    baseUrl: input.providerConfig.baseUrl,
    temperature: input.temperature,
  })
  const completionParts = getCompletionParts(completion)
  return buildResult({
    completion,
    logProvider: input.providerKey,
    text: completionParts.text,
    reasoning: completionParts.reasoning,
  })
}

async function runSiliconFlowLlm(input: AiLlmExecutionInput): Promise<AiLlmExecutionResult> {
  const completion = await completeSiliconFlowLlm({
    modelId: input.selection.modelId,
    messages: input.messages,
    apiKey: input.providerConfig.apiKey,
    baseUrl: input.providerConfig.baseUrl,
    temperature: input.temperature,
  })
  const completionParts = getCompletionParts(completion)
  return buildResult({
    completion,
    logProvider: input.providerKey,
    text: completionParts.text,
    reasoning: completionParts.reasoning,
  })
}

async function runArkLlm(input: AiLlmExecutionInput): Promise<AiLlmExecutionResult> {
  const { arkResponsesCompletion, convertChatMessagesToArkInput, buildArkThinkingParam } = await import('@/lib/ark-llm')
  const arkThinkingParams = buildArkThinkingParam(input.selection.modelId, input.reasoning)

  const arkResult = await arkResponsesCompletion({
    apiKey: input.providerConfig.apiKey,
    model: input.selection.modelId,
    input: convertChatMessagesToArkInput(input.messages),
    thinking: arkThinkingParams.thinking,
  })

  const completion = buildOpenAIChatCompletion(
    input.selection.modelId,
    buildReasoningAwareContent(arkResult.text, arkResult.reasoning),
    arkResult.usage,
  )
  return buildResult({
    completion,
    logProvider: 'ark',
    text: arkResult.text,
    reasoning: arkResult.reasoning,
    usage: arkResult.usage,
    successDetails: { engine: 'ark_responses' },
  })
}

async function runOpenAiCompatibleBaseUrl(input: AiLlmExecutionInput): Promise<AiLlmExecutionResult> {
  if (!input.providerConfig.baseUrl) {
    throw new Error(`PROVIDER_BASE_URL_MISSING: ${input.selection.provider} (llm)`)
  }

  const isOpenRouter = input.providerConfig.baseUrl.includes('openrouter')
  const providerName = isOpenRouter ? 'openrouter' : 'openai_compatible'
  if (!isOpenRouter) {
    const aiOpenAI = createOpenAI({
      baseURL: input.providerConfig.baseUrl,
      apiKey: input.providerConfig.apiKey,
      name: providerName,
    })
    const isNativeOpenAIReasoning = shouldUseOpenAIReasoningProviderOptions({
      providerKey: input.providerKey,
      providerApiMode: input.providerConfig.apiMode,
      modelId: input.selection.modelId,
    })
    const aiSdkProviderOptions = input.reasoning && isNativeOpenAIReasoning
      ? {
        openai: {
          reasoningEffort: mapReasoningEffort(input.reasoningEffort),
          forceReasoning: true,
        },
      }
      : undefined
    const generateParams: Parameters<typeof generateText>[0] = {
      model: aiOpenAI.chat(input.selection.modelId),
      system: getSystemPrompt(input.messages),
      messages: getConversationMessages(input.messages) as ModelMessage[],
      ...(input.reasoning ? {} : { temperature: input.temperature }),
      maxRetries: input.maxRetries,
      ...(aiSdkProviderOptions ? { providerOptions: aiSdkProviderOptions } : {}),
    }
    const aiSdkResult = await generateText(generateParams)

    const usage = aiSdkResult.usage || aiSdkResult.totalUsage
    const normalizedUsage = {
      promptTokens: usage?.inputTokens ?? 0,
      completionTokens: usage?.outputTokens ?? 0,
    }
    const text = aiSdkResult.text || ''
    const reasoning = aiSdkResult.reasoningText || ''
    const completion = buildOpenAIChatCompletion(
      input.selection.modelId,
      buildReasoningAwareContent(text, reasoning),
      normalizedUsage,
    )
    return buildResult({
      completion,
      logProvider: providerName,
      text,
      reasoning,
      usage: normalizedUsage,
      successDetails: { engine: 'ai_sdk' },
    })
  }

  const client = new OpenAI({
    baseURL: input.providerConfig.baseUrl,
    apiKey: input.providerConfig.apiKey,
  })

  const extraParams: Record<string, unknown> = {}
  if (isOpenRouter && input.reasoning) {
    extraParams.reasoning = { effort: input.reasoningEffort }
  }

  const completion = await client.chat.completions.create({
    model: input.selection.modelId,
    messages: input.messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    temperature: input.temperature,
    ...extraParams,
  })
  const normalizedCompletion = completion as OpenAI.Chat.Completions.ChatCompletion
  const completionParts = getCompletionParts(normalizedCompletion)
  return buildResult({
    completion: normalizedCompletion,
    logProvider: providerName,
    text: completionParts.text,
    reasoning: completionParts.reasoning,
    successDetails: { engine: 'openai_sdk' },
  })
}

const providerRunners: Readonly<Record<string, LlmProviderRunner>> = {
  google: runGoogleLlm,
  'gemini-compatible': runGoogleLlm,
  bailian: runBailianLlm,
  siliconflow: runSiliconFlowLlm,
  ark: runArkLlm,
}

function resolveGatewayRoute(input: {
  providerKey: string
  providerId: string
  providerConfig: ProviderConfig
}) {
  return OFFICIAL_ONLY_PROVIDER_KEYS.has(input.providerKey)
    ? 'official'
    : (input.providerConfig.gatewayRoute || resolveAiGatewayRoute(input.providerId))
}

export async function executeLlmCompletionViaAdapter(
  input: AiLlmExecutionInput,
): Promise<AiLlmExecutionResult> {
  const gatewayRoute = resolveGatewayRoute({
    providerKey: input.providerKey,
    providerId: input.selection.provider,
    providerConfig: input.providerConfig,
  })
  if (gatewayRoute === 'openai-compat') {
    return await runOpenAiCompatibleProtocol(input)
  }

  const runner = providerRunners[input.providerKey]
  if (runner) return await runner(input)
  return await runOpenAiCompatibleBaseUrl(input)
}

async function runGoogleVision(input: AiVisionExecutionInput): Promise<AiLlmExecutionResult> {
  const ai = new GoogleGenAI({ apiKey: input.providerConfig.apiKey })
  const { normalizeToBase64ForGeneration } = await import('@/lib/media/outbound-image')

  const parts: GoogleVisionPart[] = []
  for (const url of input.imageUrls) {
    try {
      const dataUrl = url.startsWith('data:') ? url : await normalizeToBase64ForGeneration(url)
      const base64Start = dataUrl.indexOf(';base64,')
      if (base64Start !== -1) {
        const mimeType = dataUrl.substring(5, base64Start)
        const data = dataUrl.substring(base64Start + 8)
        parts.push({ inlineData: { mimeType, data } })
      }
    } catch (error) {
      console.error('[LLM Vision] Google 图片转换失败:', error)
    }
  }
  if (input.textPrompt) parts.push({ text: input.textPrompt })

  const response = await ai.models.generateContent({
    model: input.selection.modelId,
    contents: [{ role: 'user', parts }],
    config: { temperature: input.temperature },
  })

  const text = extractGoogleText(response)
  const usage = extractGoogleUsage(response)
  const completion = buildOpenAIChatCompletion(input.selection.modelId, text, usage)
  return buildResult({
    completion,
    logProvider: 'google',
    text,
    reasoning: '',
    usage,
  })
}

async function runArkVision(input: AiVisionExecutionInput): Promise<AiLlmExecutionResult> {
  const { normalizeToBase64ForGeneration } = await import('@/lib/media/outbound-image')

  const content: ArkVisionContentItem[] = []
  for (const url of input.imageUrls) {
    let finalUrl = url
    try {
      if (!url.startsWith('http') && !url.startsWith('data:')) {
        finalUrl = await normalizeToBase64ForGeneration(url)
      } else if (url.startsWith('/')) {
        finalUrl = await normalizeToBase64ForGeneration(url)
      }
    } catch (error) {
      console.error('[LLM Vision] Ark 图片转换失败:', error)
    }
    content.push({ type: 'input_image', image_url: finalUrl })
  }
  if (input.textPrompt) {
    content.push({ type: 'input_text', text: input.textPrompt })
  }

  const thinkingType = input.reasoning ? 'enabled' : 'disabled'
  const { text, usage } = await import('@/lib/ai-providers/llm/ark').then(({ arkResponsesCompletion }) =>
    arkResponsesCompletion({
      apiKey: input.providerConfig.apiKey,
      model: input.selection.modelId,
      input: [{ role: 'user', content }],
      thinking: { type: thinkingType },
    }),
  )

  const completion = buildOpenAIChatCompletion(input.selection.modelId, text, usage)
  return buildResult({
    completion,
    logProvider: 'ark',
    text,
    reasoning: '',
    usage,
  })
}

async function runTextOnlyVision(input: AiVisionExecutionInput): Promise<AiLlmExecutionResult> {
  const prompt = input.textPrompt || 'analyze vision content'
  const completion = input.providerKey === 'bailian'
    ? await completeBailianLlm({
      modelId: input.selection.modelId,
      apiKey: input.providerConfig.apiKey,
      baseUrl: input.providerConfig.baseUrl,
      messages: [{ role: 'user', content: prompt }],
      temperature: input.temperature,
    })
    : await completeSiliconFlowLlm({
      modelId: input.selection.modelId,
      apiKey: input.providerConfig.apiKey,
      baseUrl: input.providerConfig.baseUrl,
      messages: [{ role: 'user', content: prompt }],
      temperature: input.temperature,
    })
  const completionParts = getCompletionParts(completion)
  return buildResult({
    completion,
    logProvider: input.providerKey,
    text: completionParts.text,
    reasoning: completionParts.reasoning,
  })
}

async function runOpenAiVision(input: AiVisionExecutionInput): Promise<AiLlmExecutionResult> {
  if (!input.providerConfig.baseUrl) {
    throw new Error(`PROVIDER_BASE_URL_MISSING: ${input.selection.provider} (llm)`)
  }

  const client = new OpenAI({
    baseURL: input.providerConfig.baseUrl,
    apiKey: input.providerConfig.apiKey,
  })

  const content: OpenAiVisionContentItem[] = []
  if (input.textPrompt) content.push({ type: 'text', text: input.textPrompt })

  for (const url of input.imageUrls) {
    let finalUrl = url
    if (url.startsWith('/api/files/') || url.startsWith('/')) {
      try {
        const { normalizeToBase64ForGeneration } = await import('@/lib/media/outbound-image')
        finalUrl = await normalizeToBase64ForGeneration(url)
      } catch {
        const baseUrl = getInternalBaseUrl()
        finalUrl = `${baseUrl}${url}`
      }
    }
    content.push({ type: 'image_url', image_url: { url: finalUrl } })
  }

  const completion = await client.chat.completions.create({
    model: input.selection.modelId,
    messages: [{ role: 'user', content }],
    temperature: input.temperature,
  })
  const normalizedCompletion = completion as OpenAI.Chat.Completions.ChatCompletion
  const completionParts = getCompletionParts(normalizedCompletion)
  return buildResult({
    completion: normalizedCompletion,
    logProvider: input.selection.provider,
    text: completionParts.text,
    reasoning: completionParts.reasoning,
  })
}

const visionProviderRunners: Readonly<Record<string, VisionProviderRunner>> = {
  google: runGoogleVision,
  'gemini-compatible': runGoogleVision,
  ark: runArkVision,
  bailian: runTextOnlyVision,
  siliconflow: runTextOnlyVision,
}

export async function executeVisionCompletionViaAdapter(
  input: AiVisionExecutionInput,
): Promise<AiLlmExecutionResult> {
  const runner = visionProviderRunners[input.providerKey]
  if (runner) return await runner(input)
  return await runOpenAiVision(input)
}
