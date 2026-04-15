'use client'

import { useChat } from '@ai-sdk/react'
import { AssistantChatTransport, useAISDKRuntime } from '@assistant-ui/react-ai-sdk'
import type { AssistantRuntime } from '@assistant-ui/react'
import type { ChatStatus, UIMessage } from 'ai'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  useProjectAssistantThread,
  useProjectAssistantThreadSync,
} from '@/lib/query/hooks'
import {
  WORKSPACE_ASSISTANT_WORKFLOW_EVENT,
  type WorkspaceAssistantWorkflowEventDetail,
} from './workspace-assistant-events'
import {
  buildWorkflowCompletedMessage,
  buildWorkflowErrorMessage,
  buildWorkflowTimelineMessages,
} from './workflow-timeline'

interface UseWorkspaceAssistantRuntimeParams {
  projectId: string
  episodeId?: string
  currentStage: string
}

interface UseWorkspaceAssistantRuntimeResult {
  runtime: AssistantRuntime
  messages: UIMessage[]
  messageCount: number
  status: ChatStatus
  pending: boolean
  error: Error | undefined
  syncError: string | null
  storageError: string | null
  storageLoading: boolean
  replaceMessages: (messages: UIMessage[]) => void
  appendMessages: (messages: UIMessage[]) => void
}

export function useWorkspaceAssistantRuntime({
  projectId,
  episodeId,
  currentStage,
}: UseWorkspaceAssistantRuntimeParams): UseWorkspaceAssistantRuntimeResult {
  const threadKey = `${projectId}:${episodeId || 'global'}`
  const assistantThread = useProjectAssistantThread(projectId, episodeId)
  const { save: saveAssistantThread } = useProjectAssistantThreadSync(projectId, episodeId)
  const contextPayload = useMemo(() => ({
    locale: 'zh',
    projectId,
    episodeId,
    currentStage,
  }), [currentStage, episodeId, projectId])
  const transport = useMemo(() => new AssistantChatTransport({
    api: `/api/projects/${projectId}/assistant/chat`,
    body: {
      context: contextPayload,
    },
  }), [contextPayload, projectId])
  const chat = useChat({
    id: `workspace-command:${threadKey}`,
    transport,
  })
  const runtime = useAISDKRuntime(chat)
  const hydratedThreadKeyRef = useRef<string | null>(null)
  const lastPersistedSignatureRef = useRef('[]')
  const persistQueueRef = useRef<Promise<void>>(Promise.resolve())
  const persistTimerRef = useRef<number | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)

  const replaceMessages = useCallback((messages: UIMessage[]) => {
    chat.setMessages(messages)
  }, [chat])

  const appendMessages = useCallback((messages: UIMessage[]) => {
    if (messages.length === 0) return
    chat.setMessages((current) => [...current, ...messages])
  }, [chat])

  useEffect(() => {
    if (assistantThread.isLoading) return
    if (hydratedThreadKeyRef.current === threadKey) return
    const persistedMessages = assistantThread.data?.messages || []
    const mergedMessages = chat.messages.length > 0
      ? [...persistedMessages, ...chat.messages.filter((message) => !persistedMessages.some((item) => item.id === message.id))]
      : persistedMessages
    replaceMessages(mergedMessages)
    hydratedThreadKeyRef.current = threadKey
    lastPersistedSignatureRef.current = JSON.stringify(persistedMessages)
  }, [assistantThread.data, assistantThread.isLoading, chat.messages, replaceMessages, threadKey])

  useEffect(() => {
    if (hydratedThreadKeyRef.current !== threadKey) return
    const signature = JSON.stringify(chat.messages)
    if (signature === lastPersistedSignatureRef.current) return
    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current)
    }
    persistTimerRef.current = window.setTimeout(() => {
      const nextMessages = chat.messages
      const nextSignature = JSON.stringify(nextMessages)
      persistQueueRef.current = persistQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          try {
            await saveAssistantThread(nextMessages)
            lastPersistedSignatureRef.current = nextSignature
            setSyncError(null)
          } catch (error) {
            setSyncError(error instanceof Error ? error.message : String(error))
          }
        })
    }, 400)

    return () => {
      if (persistTimerRef.current !== null) {
        window.clearTimeout(persistTimerRef.current)
        persistTimerRef.current = null
      }
    }
  }, [chat.messages, saveAssistantThread, threadKey])

  useEffect(() => {
    function onWorkflowEvent(event: Event) {
      const customEvent = event as CustomEvent<WorkspaceAssistantWorkflowEventDetail>
      const detail = customEvent.detail
      if (!detail) return

      appendMessages(
        detail.status === 'started'
          ? buildWorkflowTimelineMessages(detail.workflowId, detail.runId)
          : detail.status === 'completed'
            ? [buildWorkflowCompletedMessage(detail.workflowId, detail.runId)]
            : [buildWorkflowErrorMessage(detail)],
      )
    }

    window.addEventListener(WORKSPACE_ASSISTANT_WORKFLOW_EVENT, onWorkflowEvent)
    return () => {
      window.removeEventListener(WORKSPACE_ASSISTANT_WORKFLOW_EVENT, onWorkflowEvent)
    }
  }, [appendMessages])

  useEffect(() => {
    return () => {
      if (persistTimerRef.current !== null) {
        window.clearTimeout(persistTimerRef.current)
      }
    }
  }, [])

  return {
    runtime,
    messages: chat.messages,
    messageCount: chat.messages.length,
    status: chat.status,
    pending: chat.status === 'submitted' || chat.status === 'streaming',
    error: chat.error,
    syncError,
    storageError: assistantThread.error?.message || null,
    storageLoading: assistantThread.isLoading,
    replaceMessages,
    appendMessages,
  }
}
