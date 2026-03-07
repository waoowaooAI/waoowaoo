import { convertToModelMessages, safeValidateUIMessages, stepCountIs, streamText, type LanguageModel, type UIMessage } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { getProviderConfig, getProviderKey } from '@/lib/api-config'
import { getUserModelConfig } from '@/lib/config-service'
import { resolveLlmRuntimeModel } from '@/lib/llm/runtime-shared'
import { AssistantPlatformError } from './errors'
import { getAssistantSkill } from './registry'
import type {
  AssistantContext,
  AssistantId,
  AssistantResolvedModel,
  AssistantRuntimeContext,
} from './types'

function normalizeAssistantContext(raw: unknown): AssistantContext {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const record = raw as Record<string, unknown>
  const providerId = typeof record.providerId === 'string' ? record.providerId.trim() : ''
  const locale = typeof record.locale === 'string' ? record.locale.trim() : ''
  return {
    ...(providerId ? { providerId } : {}),
    ...(locale ? { locale } : {}),
  }
}

async function toModelMessages(messages: UIMessage[]): Promise<Awaited<ReturnType<typeof convertToModelMessages>>> {
  const withoutIds = messages.map((message) => {
    const { id: _id, ...rest } = message
    return rest
  })
  return await convertToModelMessages(withoutIds)
}

async function resolveAssistantLanguageModel(input: {
  userId: string
  analysisModelKey: string
}): Promise<{
  resolvedModel: AssistantResolvedModel
  languageModel: LanguageModel
}> {
  const selection = await resolveLlmRuntimeModel(input.userId, input.analysisModelKey)
  const providerConfig = await getProviderConfig(input.userId, selection.provider)
  const providerKey = getProviderKey(selection.provider)

  if (providerKey === 'google' || providerKey === 'gemini-compatible') {
    const google = createGoogleGenerativeAI({
      apiKey: providerConfig.apiKey,
      ...(providerConfig.baseUrl ? { baseURL: providerConfig.baseUrl } : {}),
      name: providerKey,
    })
    return {
      resolvedModel: {
        providerId: selection.provider,
        providerKey,
        modelId: selection.modelId,
      },
      languageModel: google.chat(selection.modelId),
    }
  }

  const openai = createOpenAI({
    apiKey: providerConfig.apiKey,
    ...(providerConfig.baseUrl ? { baseURL: providerConfig.baseUrl } : {}),
    name: providerKey,
  })
  return {
    resolvedModel: {
      providerId: selection.provider,
      providerKey,
      modelId: selection.modelId,
    },
    languageModel: openai.chat(selection.modelId),
  }
}

export async function createAssistantChatResponse(input: {
  userId: string
  assistantId: AssistantId
  context: unknown
  messages: unknown
}): Promise<Response> {
  const validation = await safeValidateUIMessages({ messages: input.messages })
  if (!validation.success) {
    throw new AssistantPlatformError('ASSISTANT_INVALID_REQUEST', 'messages payload is invalid')
  }

  const normalizedMessages = validation.data
  if (normalizedMessages.length === 0) {
    throw new AssistantPlatformError('ASSISTANT_INVALID_REQUEST', 'messages must not be empty')
  }

  const userConfig = await getUserModelConfig(input.userId)
  const analysisModelKey = userConfig.analysisModel?.trim() || ''
  if (!analysisModelKey) {
    throw new AssistantPlatformError('ASSISTANT_MODEL_NOT_CONFIGURED', 'analysisModel is required')
  }

  const context = normalizeAssistantContext(input.context)
  const skill = getAssistantSkill(input.assistantId)
  const resolved = await resolveAssistantLanguageModel({
    userId: input.userId,
    analysisModelKey,
  })
  const runtimeContext: AssistantRuntimeContext = {
    userId: input.userId,
    assistantId: input.assistantId,
    context,
    analysisModelKey,
    resolvedModel: resolved.resolvedModel,
  }

  const tools = skill.tools ? skill.tools(runtimeContext) : undefined

  const result = streamText({
    model: resolved.languageModel,
    system: skill.systemPrompt(runtimeContext),
    messages: await toModelMessages(normalizedMessages),
    ...(tools ? { tools } : {}),
    stopWhen: stepCountIs(skill.maxSteps ?? 4),
    temperature: skill.temperature ?? 0.2,
  })

  return result.toUIMessageStreamResponse({
    onError: (error) => {
      if (error instanceof Error && error.message) return error.message
      return 'assistant stream failed'
    },
  })
}
