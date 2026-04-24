import OpenAI from 'openai'
import { logInfo as _ulogInfo } from '@/lib/logging/core'
import type { GenerateResult } from '@/lib/ai-providers/adapters/media/generators/base'
import type { AiModality } from '@/lib/ai-registry/types'
import type { ChatCompletionOptions, ChatCompletionStreamCallbacks, ChatMessage } from '@/lib/llm/types'
import { resolveModelSelection } from '@/lib/api-config'
import { validateAiOptions } from '@/lib/ai-exec/normalize'
import { resolveMediaAdapter } from '@/lib/ai-providers/adapters'
import {
  executeAudioGeneration,
  executeImageGeneration,
  executeVideoGeneration,
} from '@/lib/ai-providers/adapters/media/execution'
import { runChatCompletion } from '@/lib/ai-exec/llm/completion-runner'
import { chatCompletionStream as runChatCompletionStream } from '@/lib/ai-providers/adapters/llm/stream-execution'
import {
  runChatCompletionWithVision,
  runChatCompletionWithVisionStream,
} from '@/lib/ai-exec/llm/vision-runner'

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

  const adapter = resolveMediaAdapter(selection)
  const descriptor = adapter.describeVariant(input.modality, selection)
  validateAiOptions({
    schema: descriptor.optionSchema,
    options: input.options,
    context: `${input.modality}:${selection.modelKey}`,
  })

  if (input.modality === 'image') {
    return await executeImageGeneration({
      userId: input.userId,
      selection,
      prompt: input.prompt,
      options: input.options,
    })
  }

  if (input.modality === 'video') {
    return await executeVideoGeneration({
      userId: input.userId,
      selection,
      imageUrl: input.imageUrl,
      options: input.options,
    })
  }

  return await executeAudioGeneration({
    userId: input.userId,
    selection,
    text: input.text,
    options: input.options,
  })
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

