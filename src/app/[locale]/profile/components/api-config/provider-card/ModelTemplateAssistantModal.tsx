'use client'

import { AssistantChatModal } from '@/components/assistant/AssistantChatModal'
import type { ProviderCardTranslator } from './types'
import {
  getAssistantSavedModelLabel,
  type UseProviderCardStateResult,
} from './hooks/useProviderCardState'

interface ModelTemplateAssistantModalProps {
  t: ProviderCardTranslator
  state: UseProviderCardStateResult
}

export function ModelTemplateAssistantModal({ t, state }: ModelTemplateAssistantModalProps) {
  const savedEvent = state.assistantSavedEvent
  const completed = savedEvent !== null
  const savedModelLabel = savedEvent ? getAssistantSavedModelLabel(savedEvent) : ''

  return (
    <AssistantChatModal
      open={state.isAssistantOpen}
      title={t('assistantTitle')}
      subtitle={t('assistantSubtitle')}
      closeLabel={t('close')}
      userLabel={t('you')}
      assistantLabel="AI"
      reasoningTitle={t('assistantReasoningTitle')}
      reasoningExpandLabel={t('assistantReasoningExpand')}
      reasoningCollapseLabel={t('assistantReasoningCollapse')}
      emptyAssistantMessage={t('assistantWelcome')}
      inputPlaceholder={t('assistantInputPlaceholder')}
      sendLabel={t('assistantSend')}
      pendingLabel={t('thinking')}
      messages={state.assistantChat.messages}
      input={state.assistantChat.input}
      pending={state.assistantChat.pending}
      completed={completed}
      completedTitle={t('assistantCompletedTitle')}
      completedMessage={t('assistantCompletedMessage', { model: savedModelLabel })}
      errorMessage={state.assistantChat.error?.message}
      onClose={state.closeAssistant}
      onInputChange={state.assistantChat.setInput}
      onSend={() => void state.handleAssistantSend()}
    />
  )
}
