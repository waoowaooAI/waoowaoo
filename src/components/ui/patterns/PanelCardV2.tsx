'use client'

import { useTranslations } from 'next-intl'
import type { PanelEditData } from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/PanelEditForm'
import type { StoryboardPanel } from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/storyboard/hooks/useStoryboardState'
import { MediaImageWithLoading } from '@/components/media/MediaImageWithLoading'
import { GlassButton, GlassChip, GlassSurface } from '@/components/ui/primitives'
import PanelEditFormV2 from './PanelEditFormV2'
import type { UiPatternMode } from './types'

interface PanelCandidateData {
  candidates: string[]
  selectedIndex: number
}

export interface PanelCardV2Props {
  panel: StoryboardPanel
  panelData: PanelEditData
  imageUrl: string | null
  globalPanelNumber: number
  isSaving: boolean
  isDeleting: boolean
  isModifying: boolean
  isTaskRunning: boolean
  failedError: string | null
  candidateData: PanelCandidateData | null
  onUpdate: (updates: Partial<PanelEditData>) => void
  onDelete: () => void
  onOpenCharacterPicker: () => void
  onOpenLocationPicker: () => void
  onRemoveCharacter: (index: number) => void
  onRemoveLocation: () => void
  onRegeneratePanelImage: (panelId: string, count?: number, force?: boolean) => void
  onOpenEditModal: () => void
  onOpenAIDataModal: () => void
  onSelectCandidateIndex: (panelId: string, index: number) => void
  onConfirmCandidate: (panelId: string, imageUrl: string) => Promise<void>
  onCancelCandidate: (panelId: string) => void
  onClearError: () => void
  uiMode?: UiPatternMode
}

export default function PanelCardV2({
  panel,
  panelData,
  imageUrl,
  globalPanelNumber,
  isSaving,
  isDeleting,
  isModifying,
  isTaskRunning,
  failedError,
  candidateData,
  onUpdate,
  onDelete,
  onOpenCharacterPicker,
  onOpenLocationPicker,
  onRemoveCharacter,
  onRemoveLocation,
  onRegeneratePanelImage,
  onOpenEditModal,
  onOpenAIDataModal,
  onSelectCandidateIndex,
  onConfirmCandidate,
  onCancelCandidate,
  onClearError,
  uiMode = 'flow'
}: PanelCardV2Props) {
  const t = useTranslations('storyboard')
  const selectedCandidate =
    candidateData && candidateData.candidates[candidateData.selectedIndex]
      ? candidateData.candidates[candidateData.selectedIndex]
      : null

  return (
    <GlassSurface
      variant="elevated"
      padded={false}
      className={`ui-pattern-panel-card ui-pattern-panel-card-${uiMode} relative overflow-hidden`}
    >
      <div className="relative">
        <div className="aspect-[9/16] w-full overflow-hidden bg-[rgba(255,255,255,0.35)]">
          {isDeleting || isModifying || isTaskRunning ? (
            <div className="flex h-full items-center justify-center">
              <GlassChip tone={isDeleting ? 'danger' : 'info'}>
                {isDeleting
                  ? t('common.deleting')
                  : isModifying
                    ? t('common.editing')
                    : t('image.generating')}
              </GlassChip>
            </div>
          ) : failedError ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
              <GlassChip tone="danger">{t('image.failed')}</GlassChip>
              <p className="text-xs text-[var(--glass-text-secondary)]">{failedError}</p>
              <GlassButton size="sm" variant="ghost" onClick={onClearError}>{t('common.cancel')}</GlassButton>
            </div>
          ) : selectedCandidate ? (
            <MediaImageWithLoading
              src={selectedCandidate}
              alt="candidate"
              containerClassName="h-full w-full"
              className="h-full w-full object-cover"
            />
          ) : imageUrl ? (
            <MediaImageWithLoading
              src={imageUrl}
              alt="panel"
              containerClassName="h-full w-full"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <GlassButton size="sm" variant="secondary" onClick={() => onRegeneratePanelImage(panel.id, 1)}>
                {t('panel.generateImage')}
              </GlassButton>
            </div>
          )}
        </div>

        <div className="absolute left-2 top-2 flex items-center gap-2">
          <GlassChip tone="neutral">#{globalPanelNumber}</GlassChip>
          <GlassChip tone="info">{panel.shot_type || t('panel.noShotType')}</GlassChip>
        </div>

        <div className="absolute right-2 top-2">
          <GlassButton size="sm" variant="danger" onClick={onDelete}>{t('common.delete')}</GlassButton>
        </div>

        <div className="absolute bottom-2 left-2 right-2 flex flex-wrap items-center gap-2">
          <GlassButton size="sm" variant="secondary" onClick={() => onRegeneratePanelImage(panel.id, 1, isTaskRunning)}>
            {t('image.regenerate')}
          </GlassButton>
          <GlassButton size="sm" variant="secondary" onClick={onOpenEditModal}>{t('image.editImage')}</GlassButton>
          <GlassButton size="sm" variant="secondary" onClick={onOpenAIDataModal}>{t('aiData.title')}</GlassButton>

          {candidateData ? (
            <>
              <GlassButton size="sm" variant="ghost" onClick={() => onCancelCandidate(panel.id)}>{t('image.cancelSelection')}</GlassButton>
              <GlassButton
                size="sm"
                variant="primary"
                onClick={() => {
                  const candidate = candidateData.candidates[candidateData.selectedIndex]
                  if (candidate) {
                    void onConfirmCandidate(panel.id, candidate)
                  }
                }}
              >
                {t('image.confirmCandidate')}
              </GlassButton>
              <div className="ml-auto flex gap-1">
                {candidateData.candidates.slice(0, 4).map((_, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => onSelectCandidateIndex(panel.id, index)}
                    className={`h-2.5 w-2.5 rounded-full ${index === candidateData.selectedIndex ? 'bg-[var(--glass-accent-from)]' : 'bg-[var(--glass-bg-surface)]/80 border border-[var(--glass-stroke-base)]'}`}
                    aria-label={`candidate-${index + 1}`}
                  />
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>

      <div className="p-3">
        <PanelEditFormV2
          panelData={panelData}
          isSaving={isSaving}
          onUpdate={onUpdate}
          onOpenCharacterPicker={onOpenCharacterPicker}
          onOpenLocationPicker={onOpenLocationPicker}
          onRemoveCharacter={onRemoveCharacter}
          onRemoveLocation={onRemoveLocation}
          uiMode={uiMode}
        />
      </div>
    </GlassSurface>
  )
}
