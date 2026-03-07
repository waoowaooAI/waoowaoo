'use client'

import { useTranslations } from 'next-intl'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import { useWizardState } from './smart-import/hooks/useWizardState'
import StepSource from './smart-import/steps/StepSource'
import StepParse from './smart-import/steps/StepParse'
import StepMapping from './smart-import/steps/StepMapping'
import StepConfirm from './smart-import/steps/StepConfirm'
import type { SplitEpisode } from './smart-import/types'

export type { SplitEpisode } from './smart-import/types'

interface SmartImportWizardProps {
  onManualCreate: () => void
  onImportComplete: (episodes: SplitEpisode[], triggerGlobalAnalysis?: boolean) => void
  projectId: string
  importStatus?: string | null
}

export default function SmartImportWizard({
  onManualCreate,
  onImportComplete,
  projectId,
  importStatus,
}: SmartImportWizardProps) {
  const t = useTranslations('smartImport')
  const wizard = useWizardState({ projectId, importStatus, onImportComplete, t })

  const savingTaskState = wizard.saving
    ? resolveTaskPresentationState({
      phase: 'processing',
      intent: 'build',
      resource: 'text',
      hasOutput: false,
    })
    : null

  if (wizard.stage === 'select') {
    return (
      <StepSource
        onManualCreate={onManualCreate}
        rawContent={wizard.rawContent}
        onRawContentChange={wizard.setRawContent}
        onAnalyze={() => { void wizard.handleAnalyze() }}
        error={wizard.error}
        showMarkerConfirm={wizard.showMarkerConfirm}
        markerResult={wizard.markerResult}
        onCloseMarkerConfirm={() => wizard.setShowMarkerConfirm(false)}
        onUseMarkerSplit={() => { void wizard.handleMarkerSplit() }}
        onUseAiSplit={() => {
          wizard.setShowMarkerConfirm(false)
          wizard.setMarkerResult(null)
          void wizard.performAISplit()
        }}
      />
    )
  }

  if (wizard.stage === 'analyzing') {
    return <StepParse />
  }

  return (
    <div className="p-6">
      <StepConfirm
        episodes={wizard.episodes}
        saving={wizard.saving}
        savingTaskState={savingTaskState}
        onReanalyze={() => wizard.setStage('select')}
        onConfirm={() => { void wizard.handleConfirm() }}
        onConfirmWithGlobalAnalysis={() => { void wizard.handleConfirm(true) }}
      />

      <StepMapping
        episodes={wizard.episodes}
        selectedEpisode={wizard.selectedEpisode}
        onSelectEpisode={wizard.setSelectedEpisode}
        onUpdateEpisodeNumber={wizard.updateEpisodeNumber}
        onUpdateEpisodeTitle={wizard.updateEpisodeTitle}
        onUpdateEpisodeSummary={wizard.updateEpisodeSummary}
        onUpdateEpisodeContent={wizard.updateEpisodeContent}
        onAddEpisode={wizard.addEpisode}
        deleteConfirm={wizard.deleteConfirm}
        onOpenDeleteConfirm={wizard.openDeleteConfirm}
        onCloseDeleteConfirm={wizard.closeDeleteConfirm}
        onConfirmDeleteEpisode={wizard.confirmDeleteEpisode}
      />
    </div>
  )
}
