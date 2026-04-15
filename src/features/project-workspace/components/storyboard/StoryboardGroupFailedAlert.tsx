'use client'

import { AppIcon } from '@/components/ui/icons'

interface StoryboardGroupFailedAlertProps {
  failedError: string
  title: string
  closeTitle: string
  onClose: () => void
}

export default function StoryboardGroupFailedAlert({
  failedError,
  title,
  closeTitle,
  onClose,
}: StoryboardGroupFailedAlertProps) {
  return (
    <div className="mb-4 rounded-lg border border-[var(--glass-stroke-danger)] bg-[var(--glass-danger-ring)] p-3">
      <div className="flex items-start gap-3">
        <AppIcon name="alert" className="mt-0.5 h-5 w-5 shrink-0 text-[var(--glass-tone-danger-fg)]" />
        <div className="flex-1">
          <h4 className="text-sm font-bold text-[var(--glass-tone-danger-fg)]">{title}</h4>
          <p className="mt-1 text-sm text-[var(--glass-tone-danger-fg)]">{failedError}</p>
        </div>
        <button
          onClick={onClose}
          className="glass-btn-base glass-btn-tone-danger rounded p-1"
          title={closeTitle}
        >
          <AppIcon name="close" className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
