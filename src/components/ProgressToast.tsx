'use client'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { resolveTaskPresentationState } from '@/lib/task/presentation'

interface ProgressToastRunBadge {
  id: string
  label: string
  onClick: () => void
}

interface ProgressToastProps {
  show: boolean
  message: string
  step?: string
  runBadges?: ProgressToastRunBadge[]
}

export default function ProgressToast({ show, message, step, runBadges }: ProgressToastProps) {
  if (!show) return null
  const runningState = resolveTaskPresentationState({
    phase: 'processing',
    intent: 'generate',
    resource: 'text',
    hasOutput: true,
  })

  return (
    <div className="fixed bottom-8 right-8 z-50 animate-slide-up">
      <div className="glass-surface-modal min-w-[280px] max-w-[90vw] p-4">
        <div className="flex items-start space-x-3">
          {/* Loading Spinner */}
          <div className="mt-0.5 shrink-0">
            <TaskStatusInline state={runningState} className="[&>span]:sr-only" />
          </div>

          {/* Content */}
          <div className="flex-1">
            <div className="mb-1 font-semibold text-(--glass-text-primary)">
              {message}
            </div>
            {step && (
              <div className="text-sm text-(--glass-text-secondary)">
                {step}
              </div>
            )}

            {runBadges && runBadges.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {runBadges.map((badge) => (
                  <button
                    key={badge.id}
                    type="button"
                    onClick={badge.onClick}
                    className="glass-btn-base glass-btn-secondary rounded-full px-3 py-1 text-xs text-(--glass-tone-info-fg)"
                  >
                    {badge.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-(--glass-bg-muted)">
          <div className="h-1.5 rounded-full bg-(--glass-accent-from) animate-progress" />
        </div>
      </div>
    </div>
  )
}
