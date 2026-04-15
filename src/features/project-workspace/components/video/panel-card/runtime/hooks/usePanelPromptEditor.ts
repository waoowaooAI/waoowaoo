import { useCallback, useState } from 'react'

interface UsePanelPromptEditorParams {
  localPrompt: string
  onUpdateLocalPrompt: (value: string) => void
  onSavePrompt: (value: string) => Promise<void>
}

export function usePanelPromptEditor({
  localPrompt,
  onUpdateLocalPrompt,
  onSavePrompt,
}: UsePanelPromptEditorParams) {
  const [isEditing, setIsEditing] = useState(false)
  const [editingPrompt, setEditingPrompt] = useState(localPrompt)

  const handleStartEdit = useCallback(() => {
    setEditingPrompt(localPrompt)
    setIsEditing(true)
  }, [localPrompt])

  const handleSave = useCallback(async () => {
    onUpdateLocalPrompt(editingPrompt)
    setIsEditing(false)
    await onSavePrompt(editingPrompt)
  }, [editingPrompt, onSavePrompt, onUpdateLocalPrompt])

  const handleCancelEdit = useCallback(() => {
    setEditingPrompt(localPrompt)
    setIsEditing(false)
  }, [localPrompt])

  return {
    isEditing,
    editingPrompt,
    setEditingPrompt,
    handleStartEdit,
    handleSave,
    handleCancelEdit,
  }
}
