import OpenAI from 'openai'
import { getInternalBaseUrl } from '@/lib/env'
import { resolveRegisteredAiProvider } from '@/lib/ai-providers'
import { buildOpenAIChatCompletion } from '@/lib/ai-providers/llm/openai-compat'
import type { AiLlmExecutionInput, AiLlmExecutionResult } from '@/lib/ai-registry/types'
import { getCompletionParts } from '@/lib/llm/completion-parts'
import { completionUsageSummary } from '@/lib/llm/runtime-shared'

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

export async function executeLlmCompletionViaAdapter(
  input: AiLlmExecutionInput,
): Promise<AiLlmExecutionResult> {
  const provider = resolveRegisteredAiProvider(input.selection.provider)
  if (!provider.completeLlm) {
    throw new Error(`UNSUPPORTED_LLM_PROVIDER: ${input.providerKey}`)
  }
  const result = await provider.completeLlm(input)
  return buildResult(result)
}

export async function executeVisionCompletionViaAdapter(
  input: AiVisionExecutionInput,
): Promise<AiLlmExecutionResult> {
  const provider = resolveRegisteredAiProvider(input.selection.provider)
  if (provider.completeVision) {
    return buildResult(await provider.completeVision(input))
  }
  return await runOpenAiVision(input)
}
