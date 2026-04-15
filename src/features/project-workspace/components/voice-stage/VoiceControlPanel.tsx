import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import type { TaskPresentationState } from '@/lib/task/presentation'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import VoiceToolbar from '../voice/VoiceToolbar'
import EmbeddedVoiceToolbar from '../voice/EmbeddedVoiceToolbar'
import SpeakerVoiceStatus from '../voice/SpeakerVoiceStatus'
import { AppIcon } from '@/components/ui/icons'

interface BindablePanelOption {
  id: string
  storyboardId: string
  panelIndex: number
  label: string
}

interface VoiceControlPanelProps {
  children: ReactNode
  embedded: boolean
  onBack?: () => void
  analyzing: boolean
  isBatchSubmittingAll: boolean
  isDownloading: boolean
  runningLineCount: number
  allSpeakersHaveVoice: boolean
  totalLines: number
  linesWithVoice: number
  linesWithAudio: number
  speakers: string[]
  speakerStats: Record<string, number>
  isLineEditorOpen: boolean
  isSavingLineEditor: boolean
  editingLineId: string | null
  editingContent: string
  editingSpeaker: string
  editingMatchedPanelId: string
  speakerOptions: string[]
  bindablePanelOptions: BindablePanelOption[]
  savingLineEditorState: TaskPresentationState | null
  onAnalyze: () => Promise<void>
  onGenerateAll: () => Promise<void>
  onDownloadAll: () => Promise<void>
  onStartAdd: () => void
  onOpenAssetLibraryForSpeaker: (speaker: string) => void
  onOpenInlineBinding?: (speaker: string) => void
  hasSpeakerCharacter?: (speaker: string) => boolean
  onCancelEdit: () => void
  onSaveEdit: () => Promise<void>
  onEditingContentChange: (value: string) => void
  onEditingSpeakerChange: (value: string) => void
  onEditingMatchedPanelIdChange: (value: string) => void
  getSpeakerVoiceUrl: (speaker: string) => string | null
}

export default function VoiceControlPanel({
  children,
  embedded,
  onBack,
  analyzing,
  isBatchSubmittingAll,
  isDownloading,
  runningLineCount,
  allSpeakersHaveVoice,
  totalLines,
  linesWithVoice,
  linesWithAudio,
  speakers,
  speakerStats,
  isLineEditorOpen,
  isSavingLineEditor,
  editingLineId,
  editingContent,
  editingSpeaker,
  editingMatchedPanelId,
  speakerOptions,
  bindablePanelOptions,
  savingLineEditorState,
  onAnalyze,
  onGenerateAll,
  onDownloadAll,
  onStartAdd,
  onOpenAssetLibraryForSpeaker,
  onOpenInlineBinding,
  hasSpeakerCharacter,
  onCancelEdit,
  onSaveEdit,
  onEditingContentChange,
  onEditingSpeakerChange,
  onEditingMatchedPanelIdChange,
  getSpeakerVoiceUrl,
}: VoiceControlPanelProps) {
  const t = useTranslations('voice')

  return (
    <div className="space-y-6 pb-20">
      {!embedded ? (
        <VoiceToolbar
          onBack={onBack}
          onAddLine={onStartAdd}
          onAnalyze={onAnalyze}
          onGenerateAll={onGenerateAll}
          onDownloadAll={onDownloadAll}
          analyzing={analyzing}
          isBatchSubmitting={isBatchSubmittingAll}
          runningCount={runningLineCount}
          isDownloading={isDownloading}
          allSpeakersHaveVoice={allSpeakersHaveVoice}
          totalLines={totalLines}
          linesWithVoice={linesWithVoice}
          linesWithAudio={linesWithAudio}
        />
      ) : (
        <EmbeddedVoiceToolbar
          totalLines={totalLines}
          linesWithAudio={linesWithAudio}
          analyzing={analyzing}
          isDownloading={isDownloading}
          isBatchSubmitting={isBatchSubmittingAll}
          runningCount={runningLineCount}
          allSpeakersHaveVoice={allSpeakersHaveVoice}
          onAddLine={onStartAdd}
          onAnalyze={onAnalyze}
          onDownloadAll={onDownloadAll}
          onGenerateAll={onGenerateAll}
        />
      )}

      {speakers.length > 0 && (
        <SpeakerVoiceStatus
          speakers={speakers}
          speakerStats={speakerStats}
          getSpeakerVoiceUrl={getSpeakerVoiceUrl}
          onOpenAssetLibrary={onOpenAssetLibraryForSpeaker}
          onOpenInlineBinding={onOpenInlineBinding}
          hasSpeakerCharacter={hasSpeakerCharacter}
          embedded={embedded}
        />
      )}

      {children}

      {isLineEditorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--glass-overlay)] p-4" onClick={onCancelEdit}>
          <div className="w-full max-w-xl bg-[var(--glass-bg-surface)] rounded-2xl shadow-2xl border border-[var(--glass-stroke-base)] p-5" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-[var(--glass-text-primary)]">
                {editingLineId ? t('lineEditor.editTitle') : t('lineEditor.addTitle')}
              </h3>
              <button
                onClick={onCancelEdit}
                className="p-1 text-[var(--glass-text-tertiary)] hover:text-[var(--glass-text-secondary)] transition-colors"
                title={t('common.cancel')}
              >
                <AppIcon name="close" className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--glass-text-secondary)] mb-1.5">{t('lineEditor.contentLabel')}</label>
                <textarea
                  value={editingContent}
                  onChange={(event) => onEditingContentChange(event.target.value)}
                  placeholder={t('lineEditor.contentPlaceholder')}
                  rows={4}
                  className="w-full rounded-xl border border-[var(--glass-stroke-strong)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--glass-tone-info-fg)] resize-y"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--glass-text-secondary)] mb-1.5">{t('lineEditor.speakerLabel')}</label>
                <select
                  value={editingSpeaker}
                  onChange={(event) => onEditingSpeakerChange(event.target.value)}
                  className="w-full rounded-xl border border-[var(--glass-stroke-strong)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--glass-tone-info-fg)]"
                >
                  <option value="" disabled>{t('lineEditor.selectSpeaker')}</option>
                  {speakerOptions.map((speaker) => (
                    <option key={speaker} value={speaker}>
                      {speaker}
                    </option>
                  ))}
                </select>
                {speakerOptions.length === 0 && (
                  <p className="mt-1 text-xs text-[var(--glass-tone-warning-fg)]">{t('lineEditor.noSpeakerOptions')}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--glass-text-secondary)] mb-1.5">{t('lineEditor.bindPanelLabel')}</label>
                <select
                  value={editingMatchedPanelId}
                  onChange={(event) => onEditingMatchedPanelIdChange(event.target.value)}
                  className="w-full rounded-xl border border-[var(--glass-stroke-strong)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--glass-tone-info-fg)]"
                >
                  <option value="">{t('lineEditor.unboundPanel')}</option>
                  {bindablePanelOptions.map((panel) => (
                    <option key={panel.id} value={panel.id}>
                      {panel.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 mt-6">
              <button
                onClick={onCancelEdit}
                disabled={isSavingLineEditor}
                className="px-4 py-2 text-sm rounded-lg border border-[var(--glass-stroke-base)] text-[var(--glass-text-secondary)] hover:bg-[var(--glass-bg-muted)] disabled:opacity-60"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={onSaveEdit}
                disabled={isSavingLineEditor}
                className="px-4 py-2 text-sm rounded-lg bg-[var(--glass-accent-from)] text-white hover:bg-[var(--glass-accent-to)] disabled:opacity-60 flex items-center gap-2"
              >
                {isSavingLineEditor && (
                  <TaskStatusInline state={savingLineEditorState} className="text-white [&>span]:text-white [&_svg]:text-white" />
                )}
                <span>{editingLineId ? t('lineEditor.saveEdit') : t('lineEditor.saveAdd')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
