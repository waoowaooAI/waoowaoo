'use client'

import { useCallback, useState } from 'react'
import { AppIcon } from '@/components/ui/icons'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import type { TaskPresentationState } from '@/lib/task/presentation'
import GlassModalShell from '@/components/ui/primitives/GlassModalShell'

interface AiModifyDescriptionFieldProps {
  label: string
  description: string
  onDescriptionChange: (value: string) => void
  descriptionPlaceholder: string
  descriptionHeightClassName?: string
  aiInstruction: string
  onAiInstructionChange: (value: string) => void
  aiInstructionPlaceholder: string
  onAiModify: () => Promise<boolean> | boolean
  isAiModifying: boolean
  aiModifyingState: TaskPresentationState | null
  actionLabel: string
  cancelLabel: string
}

export function AiModifyDescriptionField({
  label,
  description,
  onDescriptionChange,
  descriptionPlaceholder,
  descriptionHeightClassName = 'h-48',
  aiInstruction,
  onAiInstructionChange,
  aiInstructionPlaceholder,
  onAiModify,
  isAiModifying,
  aiModifyingState,
  actionLabel,
  cancelLabel,
}: AiModifyDescriptionFieldProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)

  const handleCloseModal = useCallback(() => {
    if (isAiModifying) return
    setIsModalOpen(false)
  }, [isAiModifying])

  const handleConfirmModify = useCallback(async () => {
    const didModify = await Promise.resolve(onAiModify())
    if (didModify) {
      setIsModalOpen(false)
    }
  }, [onAiModify])

  return (
    <div className="space-y-2">
      <label className="glass-field-label block">
        {label}
      </label>
      <div className="relative overflow-hidden rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] transition-[border-color,background-color] hover:border-[var(--glass-stroke-strong)] focus-within:border-[var(--glass-stroke-focus)] focus-within:bg-[var(--glass-bg-surface-strong)]">
        <textarea
          value={description}
          onChange={(event) => onDescriptionChange(event.target.value)}
          className={`app-scrollbar w-full resize-none border-0 bg-transparent px-4 py-3 pb-16 text-sm leading-6 text-[var(--glass-text-primary)] outline-none placeholder:text-[var(--glass-text-tertiary)] ${descriptionHeightClassName}`}
          placeholder={descriptionPlaceholder}
          disabled={isAiModifying}
        />
        <div className="pointer-events-none absolute bottom-4 right-4">
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            disabled={isAiModifying}
            className="glass-btn-base pointer-events-auto flex h-10 flex-shrink-0 items-center gap-1.5 border border-[var(--glass-stroke-strong)] bg-[var(--glass-bg-surface)] px-3 text-sm transition-all hover:border-[var(--glass-tone-info-fg)]/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isAiModifying ? (
              <TaskStatusInline state={aiModifyingState} className="text-[var(--glass-tone-info-fg)] [&>span]:text-[var(--glass-tone-info-fg)] [&_svg]:text-[var(--glass-tone-info-fg)]" />
            ) : (
              <>
                <AppIcon name="sparkles" className="h-4 w-4 text-[#7c3aed]" />
                <span
                  className="font-medium"
                  style={{
                    background: 'linear-gradient(135deg, #3b82f6, #7c3aed)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  {actionLabel}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
      <GlassModalShell
        open={isModalOpen}
        onClose={handleCloseModal}
        title={actionLabel}
        description={label}
        size="sm"
        footer={(
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={handleCloseModal}
              disabled={isAiModifying}
              className="glass-btn-base glass-btn-secondary px-4 py-2 rounded-lg disabled:cursor-not-allowed disabled:opacity-50"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={() => void handleConfirmModify()}
              disabled={isAiModifying || !aiInstruction.trim()}
              className="glass-btn-base glass-btn-primary px-4 py-2 rounded-lg disabled:cursor-not-allowed disabled:opacity-50 flex items-center gap-2"
            >
              {isAiModifying ? (
                <TaskStatusInline state={aiModifyingState} className="text-white [&>span]:text-white [&_svg]:text-white" />
              ) : (
                actionLabel
              )}
            </button>
          </div>
        )}
      >
        <div className="space-y-4">
          <textarea
            value={aiInstruction}
            onChange={(event) => onAiInstructionChange(event.target.value)}
            placeholder={aiInstructionPlaceholder}
            className="glass-textarea-base app-scrollbar h-32 w-full resize-none px-4 py-3 text-sm"
            disabled={isAiModifying}
            autoFocus
          />
        </div>
      </GlassModalShell>
    </div>
  )
}
