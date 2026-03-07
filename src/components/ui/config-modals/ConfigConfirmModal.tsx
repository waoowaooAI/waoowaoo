'use client'

import { useTranslations } from 'next-intl'

interface ConfigConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
  confirmDisabled?: boolean
}

export function ConfigConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText,
  cancelText,
  danger = false,
  confirmDisabled = false,
}: ConfigConfirmModalProps) {
  const t = useTranslations('configModal')
  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center glass-overlay animate-fadeIn"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="glass-surface-modal w-full max-w-md p-6">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-[var(--glass-text-primary)]">{title}</h3>
          {description && (
            <p className="mt-2 text-sm text-[var(--glass-text-secondary)]">{description}</p>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="glass-btn-base glass-btn-secondary px-3 py-1.5 text-sm">
            {cancelText || t('cancel')}
          </button>
          <button
            onClick={onConfirm}
            disabled={confirmDisabled}
            className={`glass-btn-base px-3 py-1.5 text-sm ${danger ? 'glass-btn-tone-danger' : 'glass-btn-primary'} disabled:pointer-events-none disabled:opacity-50`}
          >
            {confirmText || t('confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
