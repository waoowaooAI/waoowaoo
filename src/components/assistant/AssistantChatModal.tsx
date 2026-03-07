'use client'

import type { UIMessage } from 'ai'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Conversation, ConversationContent, ConversationScrollButton } from '@/components/ai-elements/conversation'
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message'
import { Reasoning, ReasoningContent, ReasoningTrigger } from '@/components/ai-elements/reasoning'
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput, type ToolPart } from '@/components/ai-elements/tool'
import { AppIcon } from '@/components/ui/icons'

interface AssistantChatModalProps {
  open: boolean
  title: string
  subtitle: string
  closeLabel: string
  userLabel: string
  assistantLabel: string
  reasoningTitle: string
  reasoningExpandLabel: string
  reasoningCollapseLabel: string
  emptyAssistantMessage?: string
  inputPlaceholder: string
  sendLabel: string
  pendingLabel: string
  messages: UIMessage[]
  input: string
  pending: boolean
  completed?: boolean
  completedTitle?: string
  completedMessage?: string
  errorMessage?: string
  onClose: () => void
  onInputChange: (value: string) => void
  onSend: () => void
}

interface ParsedMessageContent {
  lines: string[]
  reasoningLines: string[]
}

type ParsedToolPart =
  | {
    partType: 'dynamic-tool'
    state: ToolPart['state']
    toolName: string
    input: unknown
    output: unknown
    errorText?: string
  }
  | {
    partType: Exclude<ToolPart['type'], 'dynamic-tool'>
    state: ToolPart['state']
    input: unknown
    output: unknown
    errorText?: string
  }

interface RenderableMessage {
  id: string
  role: UIMessage['role']
  lines: string[]
  reasoningLines: string[]
  tools: ParsedToolPart[]
}

interface MessageCacheEntry {
  signature: string
  rendered: RenderableMessage
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function joinClassNames(...values: Array<string | undefined>): string {
  return values.filter((value): value is string => Boolean(value)).join(' ')
}

function isToolState(value: string): value is ToolPart['state'] {
  return value === 'approval-requested'
    || value === 'approval-responded'
    || value === 'input-streaming'
    || value === 'input-available'
    || value === 'output-available'
    || value === 'output-error'
    || value === 'output-denied'
}

function isToolPartType(value: string): value is ToolPart['type'] {
  if (value === 'dynamic-tool') return true
  return value.startsWith('tool-')
}

function splitThinkTaggedContent(input: string): { text: string; reasoning: string } {
  const thinkTagPattern = /<(think|thinking)\b[^>]*>([\s\S]*?)<\/\1>/gi
  const reasoningParts: string[] = []
  let hadTag = false

  const stripped = input.replace(thinkTagPattern, (_fullMatch, _tagName: string, inner: string) => {
    hadTag = true
    const trimmedInner = inner.trim()
    if (trimmedInner) reasoningParts.push(trimmedInner)
    return ''
  })

  let visibleText = stripped

  const openTagMatch = visibleText.match(/<(think|thinking)\b[^>]*>/i)
  if (openTagMatch && typeof openTagMatch.index === 'number') {
    hadTag = true
    const start = openTagMatch.index
    const openTag = openTagMatch[0]
    const tail = visibleText
      .slice(start + openTag.length)
      .replace(/<\/(think|thinking)\s*>/gi, '')
      .trim()
    if (tail) reasoningParts.push(tail)
    visibleText = visibleText.slice(0, start)
  }

  if (!hadTag) {
    return {
      text: input.trim(),
      reasoning: '',
    }
  }

  return {
    text: visibleText.trim(),
    reasoning: reasoningParts.join('\n\n').trim(),
  }
}

function parseToolPart(part: unknown): ParsedToolPart | null {
  if (!isRecord(part)) return null
  const rawType = readTrimmedString(part.type)
  if (!isToolPartType(rawType)) return null
  const rawState = readTrimmedString(part.state)
  if (!isToolState(rawState)) return null
  const toolName = readTrimmedString(part.toolName)
  const output = part.output
  const input = part.input
  const errorText = readTrimmedString(part.errorText) || undefined
  if (rawType === 'dynamic-tool') {
    if (!toolName) return null
    return {
      partType: rawType,
      state: rawState,
      toolName,
      input,
      output,
      ...(errorText ? { errorText } : {}),
    }
  }
  return {
    partType: rawType,
    state: rawState,
    input,
    output,
    ...(errorText ? { errorText } : {}),
  }
}

function buildMessageSignature(message: UIMessage): string {
  const parts: string[] = []
  for (const part of message.parts) {
    if (!isRecord(part)) {
      parts.push('x')
      continue
    }
    const partRecord = part as Record<string, unknown>
    const type = readTrimmedString(partRecord.type)
    const state = readTrimmedString(partRecord.state)
    const toolName = readTrimmedString(partRecord.toolName)
    const text = typeof partRecord.text === 'string' ? partRecord.text : ''
    const errorText = typeof partRecord.errorText === 'string' ? partRecord.errorText : ''
    let outputMarker = ''
    if (isRecord(partRecord.output)) {
      outputMarker = `${readTrimmedString(partRecord.output.status)}:${readTrimmedString(partRecord.output.message)}`
    }
    parts.push(`${type}:${state}:${toolName}:${text}:${errorText}:${outputMarker}`)
  }
  return `${message.role}|${parts.join('|')}`
}

export function extractMessageContent(message: UIMessage): ParsedMessageContent {
  const lines: string[] = []
  const reasoningLines: string[] = []

  for (const part of message.parts) {
    if (!isRecord(part)) continue
    const partRecord = part as Record<string, unknown>
    const partType = readTrimmedString(partRecord.type)
    const text = typeof partRecord.text === 'string' ? partRecord.text.trim() : ''

    if (partType === 'text' && text) {
      const parsed = splitThinkTaggedContent(text)
      if (parsed.reasoning) reasoningLines.push(parsed.reasoning)
      if (parsed.text) lines.push(parsed.text)
      continue
    }

    if (partType === 'reasoning' && text) {
      const parsed = splitThinkTaggedContent(text)
      if (parsed.reasoning) reasoningLines.push(parsed.reasoning)
      else if (parsed.text) reasoningLines.push(parsed.text)
      continue
    }

    const isSaveToolPart = partType === 'tool-saveModelTemplate' || partType === 'tool-saveModelTemplates'
    if (!isSaveToolPart) continue

    const state = readTrimmedString(partRecord.state)
    if (state === 'output-error') {
      const errorText = readTrimmedString(partRecord.errorText)
      if (errorText) lines.push(errorText)
      continue
    }

    if (state !== 'output-available') continue
    const output = partRecord.output
    if (!isRecord(output)) continue
    const messageText = readTrimmedString(output.message)
    if (messageText) lines.push(messageText)
    const issues = output.issues
    if (Array.isArray(issues)) {
      for (const issue of issues) {
        if (!isRecord(issue)) continue
        const field = readTrimmedString(issue.field)
        const issueMessage = readTrimmedString(issue.message)
        if (!field && !issueMessage) continue
        lines.push(`${field || 'issue'}: ${issueMessage || 'invalid'}`)
      }
    }
  }

  return {
    lines,
    reasoningLines,
  }
}

function buildRenderableMessage(message: UIMessage): RenderableMessage {
  const base = extractMessageContent(message)
  const tools = message.parts
    .map((part) => parseToolPart(part))
    .filter((part): part is ParsedToolPart => part !== null)

  return {
    id: message.id,
    role: message.role,
    lines: base.lines,
    reasoningLines: base.reasoningLines,
    tools,
  }
}

function onEnterSubmit(event: KeyboardEvent<HTMLInputElement>, submit: () => void) {
  if (event.key !== 'Enter') return
  if (event.shiftKey || event.nativeEvent.isComposing) return
  event.preventDefault()
  submit()
}

export function AssistantChatModal({
  open,
  title,
  subtitle,
  closeLabel,
  userLabel,
  assistantLabel,
  reasoningTitle,
  reasoningExpandLabel,
  reasoningCollapseLabel,
  emptyAssistantMessage,
  inputPlaceholder,
  sendLabel,
  pendingLabel,
  messages,
  input,
  pending,
  completed = false,
  completedTitle,
  completedMessage,
  errorMessage,
  onClose,
  onInputChange,
  onSend,
}: AssistantChatModalProps) {
  const [expandedReasoningByMessageId, setExpandedReasoningByMessageId] = useState<Record<string, boolean>>({})
  const messageCacheRef = useRef(new Map<string, MessageCacheEntry>())

  useEffect(() => {
    if (!open) setExpandedReasoningByMessageId({})
  }, [open])

  const visibleMessages = useMemo(() => {
    const nextCache = new Map<string, MessageCacheEntry>()
    const list: RenderableMessage[] = []
    for (const message of messages) {
      const signature = buildMessageSignature(message)
      const cached = messageCacheRef.current.get(message.id)
      const rendered = cached && cached.signature === signature
        ? cached.rendered
        : buildRenderableMessage(message)
      nextCache.set(message.id, { signature, rendered })
      if (rendered.lines.length > 0 || rendered.reasoningLines.length > 0 || rendered.tools.length > 0) {
        list.push(rendered)
      }
    }
    messageCacheRef.current = nextCache
    return list
  }, [messages])

  const lastAssistantMessageId = useMemo(() => {
    for (let index = visibleMessages.length - 1; index >= 0; index -= 1) {
      const message = visibleMessages[index]
      if (message?.role === 'assistant') return message.id
    }
    return null
  }, [visibleMessages])

  const shouldShowEmptyAssistantMessage =
    visibleMessages.length === 0
    && typeof emptyAssistantMessage === 'string'
    && emptyAssistantMessage.trim().length > 0

  if (!open) return null

  const setReasoningExpanded = (messageId: string, openState: boolean): void => {
    setExpandedReasoningByMessageId((previous) => ({
      ...previous,
      [messageId]: openState,
    }))
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center glass-overlay px-4"
      onClick={onClose}
    >
      <div
        className="glass-surface-modal w-full max-w-3xl overflow-hidden rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--glass-stroke-base)] px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-[var(--glass-text-primary)]">{title}</h3>
            <p className="text-xs text-[var(--glass-text-secondary)]">{subtitle}</p>
          </div>
          <button
            onClick={onClose}
            className="glass-icon-btn-sm"
            title={closeLabel}
          >
            <AppIcon name="close" className="h-4 w-4" />
          </button>
        </div>

        <div className="h-[420px] overflow-hidden bg-[var(--glass-bg-soft)]">
          {completed ? (
            <div className="flex h-full items-center justify-center px-4 py-4">
              <div className="w-full max-w-md rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] px-6 py-7 text-center shadow-sm">
                <div className="relative mx-auto mb-4 flex h-20 w-20 items-center justify-center">
                  <div className="absolute h-20 w-20 rounded-full bg-emerald-500/20 animate-ping" />
                  <div className="relative z-10 flex h-20 w-20 items-center justify-center rounded-full border border-emerald-400/60 bg-emerald-500/15">
                    <AppIcon name="check" className="h-10 w-10 text-emerald-500" />
                  </div>
                </div>
                <div className="text-base font-semibold text-[var(--glass-text-primary)]">
                  {completedTitle || assistantLabel}
                </div>
                {completedMessage && (
                  <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[var(--glass-text-secondary)]">
                    {completedMessage}
                  </div>
                )}
                <div className="mt-4 text-xs text-[var(--glass-text-tertiary)]">
                  {closeLabel}
                </div>
              </div>
            </div>
          ) : (
            <Conversation className="h-full">
              <ConversationContent className="h-full space-y-3 p-4">
                {shouldShowEmptyAssistantMessage && (
                  <Message from="assistant">
                    <MessageContent className="max-w-[84%] rounded-2xl rounded-bl-md border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] px-3 py-2">
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--glass-text-tertiary)]">
                        {assistantLabel}
                      </div>
                      <MessageResponse className="whitespace-pre-wrap break-words leading-relaxed">
                        {emptyAssistantMessage}
                      </MessageResponse>
                    </MessageContent>
                  </Message>
                )}

                {visibleMessages.map((message) => {
                  const isAssistant = message.role === 'assistant'
                  const isStreamingAssistantMessage = pending && isAssistant && message.id === lastAssistantMessageId
                  return (
                    <Message key={message.id} from={message.role}>
                      <MessageContent
                        className={isAssistant
                          ? 'max-w-[84%] rounded-2xl rounded-bl-md border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] px-3 py-2'
                          : 'max-w-[84%] rounded-2xl rounded-br-md bg-[var(--brand-primary)]/15 px-3 py-2'}
                      >
                        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--glass-text-tertiary)]">
                          {isAssistant ? assistantLabel : userLabel}
                        </div>

                        {isAssistant && message.reasoningLines.length > 0 && (
                          <Reasoning
                            open={Boolean(expandedReasoningByMessageId[message.id])}
                            onOpenChange={(nextOpenState) => setReasoningExpanded(message.id, nextOpenState)}
                            className="mb-2 rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-soft)] p-2"
                          >
                            <ReasoningTrigger className="text-xs text-[var(--glass-text-secondary)]">
                              <span className="mr-2">{reasoningTitle}</span>
                              <span className="text-[11px] text-[var(--glass-text-tertiary)]">
                                {expandedReasoningByMessageId[message.id] ? reasoningCollapseLabel : reasoningExpandLabel}
                              </span>
                            </ReasoningTrigger>
                            <ReasoningContent className="space-y-1 border-t border-[var(--glass-stroke-base)] pt-2 text-xs text-[var(--glass-text-secondary)]">
                              {message.reasoningLines.join('\n\n')}
                            </ReasoningContent>
                          </Reasoning>
                        )}

                        {message.lines.map((line, index) => (
                          <MessageResponse
                            key={`${message.id}-line-${index}`}
                            className={joinClassNames(
                              'whitespace-pre-wrap break-words leading-relaxed',
                              isStreamingAssistantMessage ? 'assistant-streaming-response' : undefined,
                            )}
                          >
                            {line}
                          </MessageResponse>
                        ))}

                        {message.tools.map((tool, index) => (
                          <Tool
                            key={`${message.id}-tool-${index}`}
                            defaultOpen={tool.state !== 'output-available'}
                            className="mt-2 border-[var(--glass-stroke-base)] bg-[var(--glass-bg-soft)]"
                          >
                            {tool.partType === 'dynamic-tool'
                              ? <ToolHeader type={tool.partType} state={tool.state} toolName={tool.toolName} />
                              : <ToolHeader type={tool.partType} state={tool.state} />}
                            <ToolContent>
                              {tool.input !== undefined && <ToolInput input={tool.input as ToolPart['input']} />}
                              <ToolOutput
                                output={tool.output as ToolPart['output']}
                                errorText={tool.errorText as ToolPart['errorText']}
                              />
                            </ToolContent>
                          </Tool>
                        ))}
                      </MessageContent>
                    </Message>
                  )
                })}

                {pending && !completed && (
                  <Message from="assistant">
                    <MessageContent className="max-w-[84%] rounded-2xl rounded-bl-md border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] px-3 py-2">
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--glass-text-tertiary)]">
                        {assistantLabel}
                      </div>
                      <MessageResponse>{pendingLabel}</MessageResponse>
                    </MessageContent>
                  </Message>
                )}

                {errorMessage && (
                  <div className="rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] px-3 py-2 text-xs text-[var(--glass-text-secondary)]">
                    {errorMessage}
                  </div>
                )}
              </ConversationContent>
              <ConversationScrollButton />
            </Conversation>
          )}
        </div>

        <div className="border-t border-[var(--glass-stroke-base)] px-4 py-3">
          <div className="flex items-center gap-2">
            {completed ? (
              <button
                onClick={onClose}
                className="glass-btn-base glass-btn-primary ml-auto px-3 py-2 text-sm font-medium"
              >
                {closeLabel}
              </button>
            ) : (
              <>
                <input
                  type="text"
                  value={input}
                  onChange={(event) => onInputChange(event.target.value)}
                  onKeyDown={(event) => onEnterSubmit(event, onSend)}
                  placeholder={inputPlaceholder}
                  className="glass-input-base flex-1 px-3 py-2 text-sm"
                  disabled={pending}
                />
                <button
                  onClick={onSend}
                  disabled={pending}
                  className="glass-btn-base glass-btn-primary px-3 py-2 text-sm font-medium disabled:opacity-60"
                >
                  {pending ? pendingLabel : sendLabel}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
