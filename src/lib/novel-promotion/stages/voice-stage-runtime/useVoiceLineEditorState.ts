'use client'

import { useCallback, useEffect, useState } from 'react'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import type { VoiceLine } from './types'

interface UseVoiceLineEditorStateParams {
  speakerOptions: string[]
}

export function useVoiceLineEditorState({
  speakerOptions,
}: UseVoiceLineEditorStateParams) {
  const [isLineEditorOpen, setIsLineEditorOpen] = useState(false)
  const [isSavingLineEditor, setIsSavingLineEditor] = useState(false)
  const [editingLineId, setEditingLineId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const [editingSpeaker, setEditingSpeaker] = useState('')
  const [editingMatchedPanelId, setEditingMatchedPanelId] = useState('')

  const savingLineEditorState = isSavingLineEditor
    ? resolveTaskPresentationState({
      phase: 'processing',
      intent: 'modify',
      resource: 'audio',
      hasOutput: false,
    })
    : null

  useEffect(() => {
    if (!isLineEditorOpen) return
    if (editingLineId) return
    if (editingSpeaker) return
    if (speakerOptions.length === 0) return
    setEditingSpeaker(speakerOptions[0])
  }, [editingLineId, editingSpeaker, isLineEditorOpen, speakerOptions])

  const handleStartAdd = useCallback(() => {
    setEditingLineId(null)
    setEditingContent('')
    setEditingSpeaker(speakerOptions[0] || '')
    setEditingMatchedPanelId('')
    setIsLineEditorOpen(true)
  }, [speakerOptions])

  const handleStartEdit = useCallback((line: VoiceLine, boundPanelId: string) => {
    setEditingLineId(line.id)
    setEditingContent(line.content)
    setEditingSpeaker(line.speaker)
    setEditingMatchedPanelId(boundPanelId)
    setIsLineEditorOpen(true)
  }, [])

  const handleCancelEdit = useCallback(() => {
    setEditingLineId(null)
    setEditingContent('')
    setEditingSpeaker('')
    setEditingMatchedPanelId('')
    setIsLineEditorOpen(false)
    setIsSavingLineEditor(false)
  }, [])

  return {
    isLineEditorOpen,
    isSavingLineEditor,
    editingLineId,
    editingContent,
    editingSpeaker,
    editingMatchedPanelId,
    savingLineEditorState,
    setIsSavingLineEditor,
    setEditingContent,
    setEditingSpeaker,
    setEditingMatchedPanelId,
    handleStartAdd,
    handleStartEdit,
    handleCancelEdit,
  }
}
