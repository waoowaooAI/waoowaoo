import OpenAI from 'openai'
import { logInfo as _ulogInfo } from '@/lib/logging/core'
import type { GenerateResult } from '@/lib/ai-providers/runtime-types'
import type {
  AiModality,
  AiStepExecutionInput,
  AiStepExecutionResult,
  AiVisionStepExecutionInput,
  AiVisionStepExecutionResult,
  ChatCompletionOptions,
  ChatCompletionStreamCallbacks,
  ChatMessage,
} from '@/lib/ai-registry/types'
import { resolveModelSelection } from '@/lib/user-api/runtime-config'
import { validateAiOptions } from '@/lib/ai-exec/normalize'
import { resolveRegisteredAiProvider } from '@/lib/ai-providers'
import { runChatCompletion } from '@/lib/ai-exec/llm/completion-runner'
import { chatCompletionStream as runChatCompletionStream } from '@/lib/ai-exec/llm/completion-runner'
import {
  runChatCompletionWithVision,
  runChatCompletionWithVisionStream,
} from '@/lib/ai-exec/llm/vision-runner'
import { getCompletionContent, getCompletionParts } from '@/lib/ai-exec/llm-helpers'
import { toAiRuntimeError } from '@/lib/ai-exec/governance'

export type AiMediaExecutionModality = Extract<AiModality, 'image' | 'video' | 'audio'>

export type AiImageExecutionOptions = {
  referenceImages?: string[]
  aspectRatio?: string
  resolution?: string
  outputFormat?: string
  keepOriginalAspectRatio?: boolean
  size?: string
  quality?: string
  responseFormat?: string
}

export type AiVideoExecutionOptions = {
  prompt?: string
  duration?: number
  fps?: number
  resolution?: string
  aspectRatio?: string
  generateAudio?: boolean
  lastFrameImageUrl?: string
  [key: string]: string | number | boolean | undefined
}

export type AiAudioExecutionOptions = {
  voice?: string
  rate?: number
}

export type AiLlmExecutionInput = {
  modality: 'llm'
  userId: string
  model: string | null | undefined
  messages: ChatMessage[]
  options?: ChatCompletionOptions
}

export type AiLlmStreamExecutionInput = AiLlmExecutionInput & {
  callbacks?: ChatCompletionStreamCallbacks
}

export type AiVisionExecutionInput = {
  modality: 'vision'
  userId: string
  model: string | null | undefined
  textPrompt: string
  imageUrls?: string[]
  options?: ChatCompletionOptions
}

export type AiVisionStreamExecutionInput = AiVisionExecutionInput & {
  callbacks?: ChatCompletionStreamCallbacks
}

export type AiMediaExecutionInput =
  | {
    modality: 'image'
    userId: string
    modelKey: string
    prompt: string
    options?: AiImageExecutionOptions
  }
  | {
    modality: 'video'
    userId: string
    modelKey: string
    imageUrl: string
    options?: AiVideoExecutionOptions
  }
  | {
    modality: 'audio'
    userId: string
    modelKey: string
    text: string
    options?: AiAudioExecutionOptions
  }

export async function executeMediaGeneration(input: AiMediaExecutionInput): Promise<GenerateResult> {
  const selection = await resolveModelSelection(input.userId, input.modelKey, input.modality)
  _ulogInfo(`[ai-exec:${input.modality}] resolved model selection: ${selection.modelKey}`)
  const adapter = resolveRegisteredAiProvider(selection.provider)
  switch (input.modality) {
    case 'image': {
      const modalityAdapter = adapter[input.modality]
      if (!modalityAdapter) {
        throw new Error(`AI_PROVIDER_MODALITY_UNSUPPORTED:${selection.provider}:${input.modality}`)
      }
      const descriptor = modalityAdapter.describe(selection)
      validateAiOptions({
        schema: descriptor.optionSchema,
        options: input.options,
        context: `${input.modality}:${selection.modelKey}`,
      })
      return await modalityAdapter.execute({
        userId: input.userId,
        selection,
        prompt: input.prompt,
        options: input.options,
      })
    }
    case 'video': {
      const modalityAdapter = adapter[input.modality]
      if (!modalityAdapter) {
        throw new Error(`AI_PROVIDER_MODALITY_UNSUPPORTED:${selection.provider}:${input.modality}`)
      }
      const descriptor = modalityAdapter.describe(selection)
      validateAiOptions({
        schema: descriptor.optionSchema,
        options: input.options,
        context: `${input.modality}:${selection.modelKey}`,
      })
      return await modalityAdapter.execute({
        userId: input.userId,
        selection,
        imageUrl: input.imageUrl,
        options: input.options,
      })
    }
    case 'audio': {
      const modalityAdapter = adapter[input.modality]
      if (!modalityAdapter) {
        throw new Error(`AI_PROVIDER_MODALITY_UNSUPPORTED:${selection.provider}:${input.modality}`)
      }
      const descriptor = modalityAdapter.describe(selection)
      validateAiOptions({
        schema: descriptor.optionSchema,
        options: input.options,
        context: `${input.modality}:${selection.modelKey}`,
      })
      return await modalityAdapter.execute({
        userId: input.userId,
        selection,
        text: input.text,
        options: input.options,
      })
    }
  }
}

export async function executeLlmCompletion(input: AiLlmExecutionInput): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  return await runChatCompletion(input.userId, input.model, input.messages, input.options || {})
}

export async function executeLlmStreamCompletion(input: AiLlmStreamExecutionInput): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  return await runChatCompletionStream(input.userId, input.model, input.messages, input.options || {}, input.callbacks)
}

export async function executeVisionCompletion(input: AiVisionExecutionInput): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  return await runChatCompletionWithVision(
    input.userId,
    input.model,
    input.textPrompt,
    input.imageUrls || [],
    input.options || {},
  )
}

export async function executeVisionStreamCompletion(input: AiVisionStreamExecutionInput): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  return await runChatCompletionWithVisionStream(
    input.userId,
    input.model,
    input.textPrompt,
    input.imageUrls || [],
    input.options || {},
    input.callbacks,
  )
}

export async function chatCompletion(
  userId: string,
  model: string | null | undefined,
  messages: ChatMessage[],
  options: ChatCompletionOptions = {},
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  return await executeLlmCompletion({ modality: 'llm', userId, model, messages, options })
}

export async function chatCompletionStream(
  userId: string,
  model: string | null | undefined,
  messages: ChatMessage[],
  options: ChatCompletionOptions = {},
  callbacks?: ChatCompletionStreamCallbacks,
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  return await executeLlmStreamCompletion({ modality: 'llm', userId, model, messages, options, callbacks })
}

export async function chatCompletionWithVision(
  userId: string,
  model: string | null | undefined,
  textPrompt: string,
  imageUrls: string[] = [],
  options: ChatCompletionOptions = {},
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  return await executeVisionCompletion({ modality: 'vision', userId, model, textPrompt, imageUrls, options })
}

export async function chatCompletionWithVisionStream(
  userId: string,
  model: string | null | undefined,
  textPrompt: string,
  imageUrls: string[] = [],
  options: ChatCompletionOptions = {},
  callbacks?: ChatCompletionStreamCallbacks,
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  return await executeVisionStreamCompletion({ modality: 'vision', userId, model, textPrompt, imageUrls, options, callbacks })
}

export async function generateImage(
  userId: string,
  modelKey: string,
  prompt: string,
  options?: AiImageExecutionOptions,
): Promise<GenerateResult> {
  return await executeMediaGeneration({
    modality: 'image',
    userId,
    modelKey,
    prompt,
    options,
  })
}

export async function generateVideo(
  userId: string,
  modelKey: string,
  imageUrl: string,
  options?: AiVideoExecutionOptions,
): Promise<GenerateResult> {
  return await executeMediaGeneration({
    modality: 'video',
    userId,
    modelKey,
    imageUrl,
    options,
  })
}

export async function generateAudio(
  userId: string,
  modelKey: string,
  text: string,
  options?: AiAudioExecutionOptions,
): Promise<GenerateResult> {
  return await executeMediaGeneration({
    modality: 'audio',
    userId,
    modelKey,
    text,
    options,
  })
}

function toInt(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.floor(value))
  return 0
}

function extractUsage(completion: AiStepExecutionResult['completion']) {
  const promptTokens = toInt(completion.usage?.prompt_tokens)
  const completionTokens = toInt(completion.usage?.completion_tokens)
  const totalTokens = toInt(completion.usage?.total_tokens) || (promptTokens + completionTokens)
  return {
    promptTokens,
    completionTokens,
    totalTokens,
  }
}

function extractTextAndReasoning(completion: OpenAI.Chat.Completions.ChatCompletion): {
  text: string
  reasoning: string
} {
  try {
    return getCompletionParts(completion)
  } catch {
    const text = typeof getCompletionContent === 'function'
      ? (getCompletionContent(completion) || '')
      : ''
    return {
      text,
      reasoning: '',
    }
  }
}

export async function executeAiTextStep(input: AiStepExecutionInput): Promise<AiStepExecutionResult> {
  try {
    const completion = await chatCompletion(input.userId, input.model, input.messages, {
      temperature: input.temperature,
      reasoning: input.reasoning,
      reasoningEffort: input.reasoningEffort,
      projectId: input.projectId,
      action: input.action,
      streamStepId: input.meta.stepId,
      streamStepAttempt: input.meta.stepAttempt || 1,
      streamStepTitle: input.meta.stepTitle,
      streamStepIndex: input.meta.stepIndex,
      streamStepTotal: input.meta.stepTotal,
    })

    const parts = extractTextAndReasoning(completion)
    return {
      text: parts.text,
      reasoning: parts.reasoning,
      usage: extractUsage(completion),
      completion,
    }
  } catch (error) {
    throw toAiRuntimeError(error)
  }
}

export async function executeAiVisionStep(input: AiVisionStepExecutionInput): Promise<AiVisionStepExecutionResult> {
  try {
    const completion = await chatCompletionWithVision(input.userId, input.model, input.prompt, input.imageUrls, {
      temperature: input.temperature,
      reasoning: input.reasoning,
      reasoningEffort: input.reasoningEffort,
      projectId: input.projectId,
      action: input.action,
      streamStepId: input.meta?.stepId,
      streamStepAttempt: input.meta?.stepAttempt || 1,
      streamStepTitle: input.meta?.stepTitle,
      streamStepIndex: input.meta?.stepIndex,
      streamStepTotal: input.meta?.stepTotal,
    })

    const parts = extractTextAndReasoning(completion)
    return {
      text: parts.text,
      reasoning: parts.reasoning,
      usage: extractUsage(completion),
      completion,
    }
  } catch (error) {
    throw toAiRuntimeError(error)
  }
}
