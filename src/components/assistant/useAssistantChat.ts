'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, type ChatStatus, type UIMessage } from 'ai'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { OpenAICompatMediaTemplate } from '@/lib/openai-compat-media-template'

export type AssistantChatId = 'api-config-template' | 'tutorial'

export interface AssistantDraftModel {
  modelId: string
  name: string
  type: 'image' | 'video'
  provider: string
  compatMediaTemplate: OpenAICompatMediaTemplate
}

export interface AssistantSavedEvent {
  savedModelKey: string
  draftModel?: AssistantDraftModel
}

export interface UseAssistantChatParams {
  assistantId: AssistantChatId
  context: {
    providerId?: string
    locale?: string
  }
  enabled: boolean
  onSaved?: (event: AssistantSavedEvent) => void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readNonEmptyStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => readTrimmedString(item))
    .filter((item) => item.length > 0)
}

function parseDraftModel(value: unknown): AssistantDraftModel | undefined {
  if (!isRecord(value)) return undefined
  const modelId = readTrimmedString(value.modelId)
  const name = readTrimmedString(value.name)
  const provider = readTrimmedString(value.provider)
  const type = value.type
  const template = value.compatMediaTemplate
  if ((type !== 'image' && type !== 'video') || !modelId || !name || !provider) return undefined
  if (!isRecord(template)) return undefined
  return {
    modelId,
    name,
    type,
    provider,
    compatMediaTemplate: template as unknown as OpenAICompatMediaTemplate,
  }
}

function readSavedEventsFromPart(part: unknown): AssistantSavedEvent[] {
  if (!isRecord(part)) return []
  const partType = readTrimmedString(part.type)
  const state = readTrimmedString(part.state)
  const isSavePart = partType === 'tool-saveModelTemplate' || partType === 'tool-saveModelTemplates'
  if (!isSavePart || state !== 'output-available') return []

  const output = part.output
  if (!isRecord(output)) return []
  if (readTrimmedString(output.status) !== 'saved') return []

  const events: AssistantSavedEvent[] = []
  const savedModelKey = readTrimmedString(output.savedModelKey)
  const draftModel = parseDraftModel(output.draftModel)
  if (savedModelKey) {
    events.push({
      savedModelKey,
      ...(draftModel ? { draftModel } : {}),
    })
  }

  const savedModelKeys = readNonEmptyStringArray(output.savedModelKeys)
  const draftModelsRaw = Array.isArray(output.draftModels) ? output.draftModels : []
  const draftModels = draftModelsRaw
    .map((item) => parseDraftModel(item))
    .filter((item): item is AssistantDraftModel => Boolean(item))

  for (let index = 0; index < savedModelKeys.length; index += 1) {
    const itemSavedModelKey = savedModelKeys[index]
    if (!itemSavedModelKey) continue
    const matchedDraft = draftModels[index]
      || draftModels.find((candidate) => itemSavedModelKey.endsWith(`::${candidate.modelId}`))
    events.push({
      savedModelKey: itemSavedModelKey,
      ...(matchedDraft ? { draftModel: matchedDraft } : {}),
    })
  }

  return events
}

export function collectSavedEvents(messages: UIMessage[]): AssistantSavedEvent[] {
  const events: AssistantSavedEvent[] = []
  for (const message of messages) {
    for (const part of message.parts) {
      events.push(...readSavedEventsFromPart(part))
    }
  }
  return events
}

export interface UseAssistantChatResult {
  messages: UIMessage[]
  input: string
  status: ChatStatus
  pending: boolean
  error: Error | undefined
  setInput: (value: string) => void
  send: (content?: string) => Promise<void>
  clear: () => void
}

export function useAssistantChat(params: UseAssistantChatParams): UseAssistantChatResult {
  const [input, setInput] = useState('')
  const [renderedMessages, setRenderedMessages] = useState<UIMessage[]>([])
  const handledSavedKeysRef = useRef(new Set<string>())
  const frameIdRef = useRef<number | null>(null)
  const latestMessagesRef = useRef<UIMessage[]>([])
  const onSaved = params.onSaved
  const contextPayload = useMemo(() => ({
    providerId: params.context.providerId,
    locale: params.context.locale,
  }), [params.context.locale, params.context.providerId])

  const transport = useMemo(() => new DefaultChatTransport({
    api: '/api/user/assistant/chat',
    body: {
      assistantId: params.assistantId,
      context: contextPayload,
    },
  }), [contextPayload, params.assistantId])

  const chat = useChat({
    transport,
  })

  const pending = chat.status === 'submitted' || chat.status === 'streaming'

  useEffect(() => {
    latestMessagesRef.current = chat.messages
    if (!pending) {
      if (frameIdRef.current !== null) {
        cancelAnimationFrame(frameIdRef.current)
        frameIdRef.current = null
      }
      setRenderedMessages(chat.messages)
      return
    }
    if (frameIdRef.current !== null) return
    frameIdRef.current = requestAnimationFrame(() => {
      frameIdRef.current = null
      setRenderedMessages(latestMessagesRef.current)
    })
  }, [chat.messages, pending])

  useEffect(() => {
    return () => {
      if (frameIdRef.current !== null) {
        cancelAnimationFrame(frameIdRef.current)
        frameIdRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!onSaved) return
    const events = collectSavedEvents(chat.messages)
    for (const event of events) {
      const dedupeKey = event.savedModelKey
      if (handledSavedKeysRef.current.has(dedupeKey)) continue
      handledSavedKeysRef.current.add(dedupeKey)
      onSaved(event)
    }
  }, [chat.messages, onSaved])

  const send = useCallback(async (content?: string): Promise<void> => {
    if (!params.enabled || pending) return
    const text = (content ?? input).trim()
    if (!text) return
    setInput('')
    await chat.sendMessage({ text })
  }, [chat, input, params.enabled, pending])

  const clear = useCallback(() => {
    chat.setMessages([])
    chat.clearError()
    setInput('')
    setRenderedMessages([])
    latestMessagesRef.current = []
    if (frameIdRef.current !== null) {
      cancelAnimationFrame(frameIdRef.current)
      frameIdRef.current = null
    }
    handledSavedKeysRef.current.clear()
  }, [chat])

  return {
    messages: renderedMessages,
    input,
    status: chat.status,
    pending,
    error: chat.error,
    setInput,
    send,
    clear,
  }
}
