'use client'

import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AppIcon } from '@/components/ui/icons'

export interface GlassModalShellProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  description?: ReactNode
  footer?: ReactNode
  children: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  closeOnBackdrop?: boolean
  closeOnEsc?: boolean
  showCloseButton?: boolean
}

function cx(...names: Array<string | false | null | undefined>) {
  return names.filter(Boolean).join(' ')
}

export default function GlassModalShell({
  open,
  onClose,
  title,
  description,
  footer,
  children,
  size = 'md',
  closeOnBackdrop = true,
  closeOnEsc = true,
  showCloseButton = true
}: GlassModalShellProps) {
  useEffect(() => {
    if (!open || !closeOnEsc) return
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeydown)
    return () => window.removeEventListener('keydown', onKeydown)
  }, [open, closeOnEsc, onClose])

  if (!open || typeof document === 'undefined') return null

  const maxWidthClass =
    size === 'sm' ? 'max-w-md' :
      size === 'lg' ? 'max-w-4xl' :
        size === 'xl' ? 'max-w-6xl' :
          'max-w-2xl'

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="glass-overlay absolute inset-0"
        onMouseDown={() => {
          if (closeOnBackdrop) onClose()
        }}
      />
      <div className={cx('glass-surface-modal relative z-10 w-full overflow-hidden', maxWidthClass)}>
        {(title || description || showCloseButton) && (
          <div className="flex items-start justify-between gap-4 px-5 py-4 sm:px-6">
            <div>
              {title ? <h2 className="text-lg font-semibold text-[var(--glass-text-primary)] sm:text-xl">{title}</h2> : null}
              {description ? <p className="mt-1 text-sm text-[var(--glass-text-secondary)]">{description}</p> : null}
            </div>
            {showCloseButton ? (
              <button
                type="button"
                onClick={onClose}
                className="glass-btn-base glass-btn-ghost h-9 w-9"
                aria-label="close"
              >
                <AppIcon name="close" className="h-5 w-5" />
              </button>
            ) : null}
          </div>
        )}

        <div className="glass-divider" />
        <div className="px-5 py-4 sm:px-6 sm:py-5">{children}</div>

        {footer ? (
          <>
            <div className="glass-divider" />
            <div className="px-5 py-4 sm:px-6">{footer}</div>
          </>
        ) : null}
      </div>
    </div>,
    document.body
  )
}
