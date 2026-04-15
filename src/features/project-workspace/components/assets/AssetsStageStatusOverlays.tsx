'use client'

import TaskStatusInline from '@/components/task/TaskStatusInline'
import type { TaskPresentationState } from '@/lib/task/presentation'
import { AppIcon } from '@/components/ui/icons'

type ToastType = 'success' | 'warning' | 'error'

interface ToastState {
  message: string
  type: ToastType
}

interface AssetsStageStatusOverlaysProps {
  toast: ToastState | null
  onCloseToast: () => void
  isGlobalAnalyzing: boolean
  globalAnalyzingState: TaskPresentationState | null
  globalAnalyzingTitle: string
  globalAnalyzingHint: string
  globalAnalyzingTip: string
}

export default function AssetsStageStatusOverlays({
  toast,
  onCloseToast,
  isGlobalAnalyzing,
  globalAnalyzingState,
  globalAnalyzingTitle,
  globalAnalyzingHint,
  globalAnalyzingTip,
}: AssetsStageStatusOverlaysProps) {
  return (
    <>
      {toast && (
        <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-right">
          <div
            className={`flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg ${
              toast.type === 'success'
                ? 'bg-[var(--glass-tone-success-fg)] text-white'
                : toast.type === 'warning'
                  ? 'bg-[var(--glass-tone-warning-fg)] text-white'
                  : 'bg-[var(--glass-tone-danger-fg)] text-white'
            }`}
          >
            <span className="text-sm font-medium">{toast.message}</span>
            <button onClick={onCloseToast} className="ml-2 hover:opacity-80">
              <AppIcon name="close" className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {isGlobalAnalyzing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center glass-overlay">
          <div className="glass-surface-modal p-8 max-w-md mx-4 animate-in zoom-in-95 duration-300">
            <div className="flex flex-col items-center text-center">
              <div className="relative mb-6">
                <div className="w-20 h-20 rounded-full bg-[var(--glass-accent-from)] flex items-center justify-center">
                  <AppIcon name="ideaAlt" className="w-10 h-10 text-white" />
                </div>
              </div>

              <h3 className="text-xl font-bold text-[var(--glass-text-primary)] mb-2">
                {globalAnalyzingTitle}
              </h3>
              <p className="text-[var(--glass-text-tertiary)] text-sm mb-4">{globalAnalyzingHint}</p>
              <TaskStatusInline state={globalAnalyzingState} />

              <div className="w-full h-2 bg-[var(--glass-bg-muted)] rounded-full overflow-hidden">
                <div className="h-full bg-[var(--glass-accent-from)] rounded-full animate-pulse" style={{ width: '100%' }} />
              </div>
              <p className="text-xs text-[var(--glass-text-tertiary)] mt-2">{globalAnalyzingTip}</p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
