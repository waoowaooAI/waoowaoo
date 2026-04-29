'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { ProjectClip, ProjectPanel, ProjectStoryboard } from '@/types/project'
import StoryboardGroup from './StoryboardGroup'
import { StoryboardPanel } from './hooks/useStoryboardState'
import { PanelEditData } from '../PanelEditForm'
import { VariantData, VariantOptions } from './hooks/usePanelVariant'
import type { PanelSaveState } from './hooks/usePanelCrudActions'
import { AppIcon } from '@/components/ui/icons'
import { GlassButton } from '@/components/ui/primitives'

interface StoryboardCanvasProps {
  sortedStoryboards: ProjectStoryboard[]
  videoRatio: string
  expandedClips: Set<string>
  submittingStoryboardIds: Set<string>
  selectingCandidateIds: Set<string>
  submittingStoryboardTextIds: Set<string>
  savingPanels: Set<string>
  deletingPanelIds: Set<string>
  copyingPanelIds: Set<string>
  saveStateByPanel: Record<string, PanelSaveState>
  hasUnsavedByPanel: Set<string>
  modifyingPanels: Set<string>
  submittingPanelImageIds: Set<string>
  movingClipId: string | null
  copyingStoryboardId: string | null
  insertingAfterPanelId: string | null
  submittingVariantPanelId: string | null
  projectId: string
  episodeId: string
  storyboardStartIndex: Record<string, number>
  getClipInfo: (clipId: string) => ProjectClip | undefined
  getTextPanels: (storyboard: ProjectStoryboard) => StoryboardPanel[]
  getPanelEditData: (panel: StoryboardPanel) => PanelEditData
  formatClipTitle: (clip: ProjectClip | undefined) => string
  onToggleExpandedClip: (storyboardId: string) => void
  onMoveStoryboardGroup: (clipId: string, direction: 'up' | 'down') => Promise<void>
  onRegenerateStoryboardText: (storyboardId: string) => Promise<void>
  onAddPanel: (storyboardId: string) => Promise<void>
  onCopyStoryboard: (storyboardId: string, insertIndex: number) => Promise<void>
  onDeleteStoryboard: (storyboardId: string, panelCount: number) => Promise<void>
  onGenerateAllIndividually: (storyboardId: string) => Promise<void>
  onPreviewImage: (url: string) => void
  onCloseStoryboardError: (storyboardId: string) => void
  onPanelUpdate: (panelId: string, panel: StoryboardPanel, updates: Partial<PanelEditData>) => void
  onPanelCopy: (panelId: string) => Promise<void>
  onPanelDelete: (
    panelId: string,
    storyboardId: string,
    setLocalStoryboards: React.Dispatch<React.SetStateAction<ProjectStoryboard[]>>,
  ) => Promise<void>
  onOpenCharacterPicker: (panelId: string) => void
  onOpenLocationPicker: (panelId: string) => void
  onRemoveCharacter: (panel: StoryboardPanel, index: number, storyboardId: string) => void
  onRemoveLocation: (panel: StoryboardPanel, storyboardId: string) => void
  onRetryPanelSave: (panelId: string) => void
  onRegeneratePanelImage: (panelId: string, count?: number, force?: boolean, referencePanelIds?: string[], extraImageUrls?: string[]) => void
  onOpenEditModal: (storyboardId: string, panelIndex: number) => void
  onOpenAIDataModal: (storyboardId: string, panelIndex: number) => void
  getPanelCandidates: (panel: ProjectPanel) => { candidates: string[]; selectedIndex: number } | null
  onSelectPanelCandidateIndex: (panelId: string, index: number) => void
  onConfirmPanelCandidate: (panelId: string, imageUrl: string) => Promise<void>
  onCancelPanelCandidate: (panelId: string) => void
  onInsertPanel: (storyboardId: string, insertAfterPanelId: string, userInput: string) => Promise<void>
  onPanelVariant: (
    sourcePanelId: string,
    storyboardId: string,
    insertAfterPanelId: string,
    variant: VariantData,
    options: VariantOptions,
  ) => Promise<void>
  addStoryboardGroup: (insertIndex: number) => Promise<void>
  addingStoryboardGroup: boolean
  setLocalStoryboards: React.Dispatch<React.SetStateAction<ProjectStoryboard[]>>
}

export default function StoryboardCanvas({
  sortedStoryboards,
  videoRatio,
  expandedClips,
  submittingStoryboardIds,
  selectingCandidateIds,
  submittingStoryboardTextIds,
  savingPanels,
  deletingPanelIds,
  copyingPanelIds,
  saveStateByPanel,
  hasUnsavedByPanel,
  modifyingPanels,
  submittingPanelImageIds,
  movingClipId,
  copyingStoryboardId,
  insertingAfterPanelId,
  submittingVariantPanelId,
  projectId,
  episodeId,
  storyboardStartIndex,
  getClipInfo,
  getTextPanels,
  getPanelEditData,
  formatClipTitle,
  onToggleExpandedClip,
  onMoveStoryboardGroup,
  onRegenerateStoryboardText,
  onAddPanel,
  onCopyStoryboard,
  onDeleteStoryboard,
  onGenerateAllIndividually,
  onPreviewImage,
  onCloseStoryboardError,
  onPanelUpdate,
  onPanelCopy,
  onPanelDelete,
  onOpenCharacterPicker,
  onOpenLocationPicker,
  onRemoveCharacter,
  onRemoveLocation,
  onRetryPanelSave,
  onRegeneratePanelImage,
  onOpenEditModal,
  onOpenAIDataModal,
  getPanelCandidates,
  onSelectPanelCandidateIndex,
  onConfirmPanelCandidate,
  onCancelPanelCandidate,
  onInsertPanel,
  onPanelVariant,
  addStoryboardGroup,
  addingStoryboardGroup,
  setLocalStoryboards,
}: StoryboardCanvasProps) {
  const t = useTranslations('storyboard')
  const referencePanelOptionsByPanelId = useMemo(() => {
    const optionsByPanelId = new Map<string, Array<{ panelId: string; label: string; imageUrl: string }>>()
    const previousOptions: Array<{ panelId: string; label: string; imageUrl: string }> = []

    for (const storyboard of sortedStoryboards) {
      const panels = getTextPanels(storyboard)
      const startIndex = storyboardStartIndex[storyboard.id] ?? 0
      panels.forEach((panel, panelIndex) => {
        optionsByPanelId.set(panel.id, [...previousOptions])
        if (panel.imageUrl) {
          const panelNumber = startIndex + panelIndex + 1
          const shotType = panel.shot_type || t('panel.noShotType')
          previousOptions.push({
            panelId: panel.id,
            label: `#${panelNumber} ${shotType}`,
            imageUrl: panel.imageUrl,
          })
        }
      })
    }

    return optionsByPanelId
  }, [getTextPanels, sortedStoryboards, storyboardStartIndex, t])

  if (sortedStoryboards.length === 0) {
    return (
      <div className="text-center py-12 text-[var(--glass-text-tertiary)]">
        <p>{t('canvas.emptyTitle')}</p>
        <p className="text-sm mt-2">{t('canvas.emptyDescription')}</p>
      </div>
    )
  }

  return (
    <>
      {sortedStoryboards.map((storyboard, sbIndex) => {
        const clip = getClipInfo(storyboard.clipId)
        const textPanels = getTextPanels(storyboard)
        const isSubmittingStoryboardTask = submittingStoryboardIds.has(storyboard.id)
        const isSelectingCandidate = selectingCandidateIds.has(storyboard.id)
        const isSubmittingStoryboardTextTask = submittingStoryboardTextIds.has(storyboard.id)
        const hasAnyImage = textPanels.some((panel) => panel.imageUrl)
        const failedError = storyboard.lastError ?? null

        return (
          <div key={storyboard.id}>
            <StoryboardGroup
              storyboard={storyboard}
              clip={clip}
              sbIndex={sbIndex}
              totalStoryboards={sortedStoryboards.length}
              textPanels={textPanels}
              storyboardStartIndex={storyboardStartIndex[storyboard.id]}
              videoRatio={videoRatio}
              isExpanded={expandedClips.has(storyboard.id)}
              isSubmittingStoryboardTask={isSubmittingStoryboardTask}
              isSelectingCandidate={isSelectingCandidate}
              isSubmittingStoryboardTextTask={isSubmittingStoryboardTextTask}
              hasAnyImage={hasAnyImage}
              failedError={failedError}
              savingPanels={savingPanels}
              deletingPanelIds={deletingPanelIds}
              copyingPanelIds={copyingPanelIds}
              saveStateByPanel={saveStateByPanel}
              hasUnsavedByPanel={hasUnsavedByPanel}
              modifyingPanels={modifyingPanels}
              submittingPanelImageIds={submittingPanelImageIds}
              onToggleExpand={() => onToggleExpandedClip(storyboard.id)}
              onMoveUp={() => onMoveStoryboardGroup(storyboard.clipId, 'up')}
              onMoveDown={() => onMoveStoryboardGroup(storyboard.clipId, 'down')}
              onRegenerateText={() => onRegenerateStoryboardText(storyboard.id)}
              onAddPanel={() => onAddPanel(storyboard.id)}
              onDeleteStoryboard={() => onDeleteStoryboard(storyboard.id, textPanels.length)}
              onGenerateAllIndividually={() => onGenerateAllIndividually(storyboard.id)}
              onPreviewImage={onPreviewImage}
              onCloseError={() => onCloseStoryboardError(storyboard.id)}
              getPanelEditData={getPanelEditData}
              onPanelUpdate={onPanelUpdate}
              onPanelCopy={onPanelCopy}
              onPanelDelete={(panelId) => onPanelDelete(panelId, storyboard.id, setLocalStoryboards)}
              onOpenCharacterPicker={onOpenCharacterPicker}
              onOpenLocationPicker={onOpenLocationPicker}
              onRemoveCharacter={(panel, index) => onRemoveCharacter(panel, index, storyboard.id)}
              onRemoveLocation={(panel) => onRemoveLocation(panel, storyboard.id)}
              onRetryPanelSave={onRetryPanelSave}
              getReferencePanelOptions={(panelId) => referencePanelOptionsByPanelId.get(panelId) || []}
              onRegeneratePanelImage={onRegeneratePanelImage}
              onOpenEditModal={(panelIndex) => onOpenEditModal(storyboard.id, panelIndex)}
              onOpenAIDataModal={(panelIndex) => onOpenAIDataModal(storyboard.id, panelIndex)}
              getPanelCandidates={getPanelCandidates}
              onSelectPanelCandidateIndex={onSelectPanelCandidateIndex}
              onConfirmPanelCandidate={onConfirmPanelCandidate}
              onCancelPanelCandidate={onCancelPanelCandidate}
              formatClipTitle={formatClipTitle}
              movingClipId={movingClipId}
              isCopyingStoryboard={copyingStoryboardId === storyboard.id}
              isCopyingAnyStoryboard={copyingStoryboardId !== null}
              onInsertPanel={onInsertPanel}
              insertingAfterPanelId={insertingAfterPanelId}
              projectId={projectId}
              episodeId={episodeId}
              onPanelVariant={onPanelVariant}
              submittingVariantPanelId={submittingVariantPanelId}
              onCopyStoryboard={() => onCopyStoryboard(storyboard.id, sbIndex + 1)}
            />

            <div className="flex justify-center py-2">
              <GlassButton
                variant="ghost"
                size="sm"
                onClick={() => addStoryboardGroup(sbIndex + 1)}
                disabled={addingStoryboardGroup}
                className="opacity-60 hover:opacity-100"
              >
                <AppIcon name="plusAlt" className="h-3 w-3" />
                <span>{t('group.insertHere')}</span>
              </GlassButton>
            </div>
          </div>
        )
      })}
    </>
  )
}
