import { generateText, type LanguageModel, type UIMessage } from 'ai'
import { buildCompressionPrompt, buildSummaryText } from './copy'
import type { ProjectAgentLocale } from './locale'

const MAX_MESSAGE_COUNT = 50
const MAX_ESTIMATED_TOKENS = 12000
const TOKEN_THRESHOLD_RATIO = 0.8
const KEEP_RECENT_MESSAGES = 20

type UnknownObject = { [key: string]: unknown }

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function readMessagePartText(part: unknown): string | null {
  if (!part || typeof part !== 'object') return null
  const record = part as UnknownObject
  if (record.type === 'text' && typeof record.text === 'string') {
    const text = normalizeText(record.text)
    return text || null
  }
  if (typeof record.type === 'string') {
    return `[${record.type}]`
  }
  return null
}

function extractMessageText(message: UIMessage): string {
  const chunks = message.parts
    .map((part) => readMessagePartText(part))
    .filter((value): value is string => Boolean(value))
  return chunks.join(' ').trim()
}

function readCustomMetadata(message: UIMessage): UnknownObject | null {
  const metadata = message.metadata
  if (!metadata || typeof metadata !== 'object') return null
  const record = metadata as UnknownObject
  const custom = record.custom
  return custom && typeof custom === 'object' && !Array.isArray(custom)
    ? custom as UnknownObject
    : null
}

export function isConversationSummaryMessage(message: UIMessage): boolean {
  return readCustomMetadata(message)?.projectAgentConversationSummary === true
}

export function estimateMessageTokens(messages: UIMessage[]): number {
  let total = 0
  for (const message of messages) {
    total += 12
    total += Math.ceil(extractMessageText(message).length / 4)
  }
  return total
}

export function shouldCompressMessages(messages: UIMessage[]): boolean {
  if (messages.length > MAX_MESSAGE_COUNT) return true
  return estimateMessageTokens(messages) >= Math.floor(MAX_ESTIMATED_TOKENS * TOKEN_THRESHOLD_RATIO)
}

function buildTranscript(messages: UIMessage[]): string {
  return messages
    .map((message) => {
      const text = extractMessageText(message)
      if (!text) return null
      return `${message.role.toUpperCase()}: ${text}`
    })
    .filter((value): value is string => Boolean(value))
    .join('\n')
}

function createSummaryMessage(params: {
  locale: ProjectAgentLocale
  summary: string
  compressedCount: number
}): UIMessage {
  return {
    id: `project-agent-summary-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    role: 'system',
    metadata: {
      custom: {
        projectAgentConversationSummary: true,
        compressedCount: params.compressedCount,
      },
    },
    parts: [
      {
        type: 'text',
        text: buildSummaryText(params.locale, params.summary),
      },
    ],
  }
}

export async function compressMessages(params: {
  messages: UIMessage[]
  locale: ProjectAgentLocale
  model: LanguageModel
}): Promise<UIMessage[]> {
  if (!shouldCompressMessages(params.messages)) return params.messages
  if (params.messages.length <= KEEP_RECENT_MESSAGES) return params.messages

  const recentMessages = params.messages.slice(-KEEP_RECENT_MESSAGES)
  const olderMessages = params.messages.slice(0, -KEEP_RECENT_MESSAGES)
  const transcript = buildTranscript(olderMessages)
  if (!transcript) return recentMessages

  const compressionPrompt = buildCompressionPrompt(params.locale, transcript)
  const summaryResult = await generateText({
    model: params.model,
    system: compressionPrompt.system,
    prompt: compressionPrompt.prompt,
    temperature: 0,
  })
  const summary = normalizeText(summaryResult.text)
  if (!summary) {
    throw new Error('PROJECT_AGENT_MESSAGE_SUMMARY_EMPTY')
  }

  return [
    createSummaryMessage({
      locale: params.locale,
      summary,
      compressedCount: olderMessages.length,
    }),
    ...recentMessages,
  ]
}
