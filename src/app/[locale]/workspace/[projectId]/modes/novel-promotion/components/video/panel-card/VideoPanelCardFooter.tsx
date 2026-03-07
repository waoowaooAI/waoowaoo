import TaskStatusInline from '@/components/task/TaskStatusInline'
import type { VideoPanelRuntime } from './hooks/useVideoPanelActions'

interface VideoPanelCardFooterProps {
  runtime: VideoPanelRuntime
}

export default function VideoPanelCardFooter({ runtime }: VideoPanelCardFooterProps) {
  const { t, lipSync, taskStatus, voiceManager } = runtime

  if (!lipSync.showLipSyncPanel) return null

  return (
    <div className="fixed inset-0 glass-overlay flex items-center justify-center z-50" onClick={() => !lipSync.executingLipSync && lipSync.closeLipSyncPanel()}>
      <div className="glass-surface-modal rounded-xl p-6 max-w-md w-full mx-4" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-[var(--glass-text-primary)]">{t('panelCard.lipSyncTitle')}</h3>
          {!lipSync.executingLipSync && (
            <button onClick={lipSync.closeLipSyncPanel} className="text-[var(--glass-text-tertiary)] hover:text-[var(--glass-text-secondary)]">×</button>
          )}
        </div>

        {lipSync.lipSyncError && (
          <div className="mb-4 p-3 bg-[var(--glass-tone-danger-bg)] border border-[var(--glass-stroke-danger)] rounded-lg text-[var(--glass-tone-danger-fg)] text-sm">
            {lipSync.lipSyncError}
          </div>
        )}

        {lipSync.executingLipSync && (
          <div className="flex flex-col items-center py-8">
            <TaskStatusInline state={taskStatus.lipSyncInlineState} className="text-[var(--glass-text-secondary)] [&>span]:text-[var(--glass-text-secondary)] [&_svg]:text-[var(--glass-tone-info-fg)]" />
            <p className="text-xs text-[var(--glass-text-tertiary)] mt-2">{t('panelCard.lipSyncMayTakeMinutes')}</p>
          </div>
        )}

        {!lipSync.executingLipSync && (
          <div>
            <p className="text-sm text-[var(--glass-text-secondary)] mb-3">{t('panelCard.selectVoice')}</p>
            <div className="space-y-2">
              {voiceManager.localVoiceLines
                .filter((voiceLine) => voiceLine.audioUrl)
                .map((voiceLine) => (
                  <button
                    key={voiceLine.id}
                    onClick={() => void lipSync.executeLipSync(voiceLine)}
                    className="w-full text-left p-3 border border-[var(--glass-stroke-base)] rounded-lg hover:border-[var(--glass-stroke-focus)] hover:bg-[var(--glass-tone-info-bg)] transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[var(--glass-text-tertiary)]">{voiceLine.speaker}</span>
                      {voiceLine.audioDuration && <span className="text-xs text-[var(--glass-text-tertiary)]">{(voiceLine.audioDuration / 1000).toFixed(1)}s</span>}
                    </div>
                    <div className="text-sm text-[var(--glass-text-primary)]">&ldquo;{voiceLine.content}&rdquo;</div>
                  </button>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
