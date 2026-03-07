import type OpenAI from 'openai'
import { getCompletionContent } from '@/lib/llm-client'
import { getCompletionParts } from '@/lib/llm/completion-parts'
import {
  runModelGatewayTextCompletion,
  runModelGatewayVisionCompletion,
} from '@/lib/model-gateway/llm'
import { toAiRuntimeError } from './errors'
import type {
  AiStepExecutionInput,
  AiStepExecutionResult,
  AiVisionStepExecutionInput,
  AiVisionStepExecutionResult,
} from './types'

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
    const completion = await runModelGatewayTextCompletion({
      userId: input.userId,
      model: input.model,
      messages: input.messages,
      options: {
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
      },
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
    const completion = await runModelGatewayVisionCompletion({
      userId: input.userId,
      model: input.model,
      prompt: input.prompt,
      imageUrls: input.imageUrls,
      options: {
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
      },
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
