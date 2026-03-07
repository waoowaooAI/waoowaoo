'use client'

import { logError as _ulogError } from '@/lib/logging/core'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  VideoToolbar,
  type VideoGenerationOptionValue,
  type VideoGenerationOptions,
  type VideoModelOption,
} from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video'
import { AppIcon } from '@/components/ui/icons'
import {
  useDownloadRemoteBlob,
  useListProjectEpisodeVideoUrls,
  useMatchedVoiceLines,
  useUpdateProjectPanelLink,
} from '@/lib/query/hooks'
import { useLipSync } from '@/lib/query/hooks/useStoryboards'
import ImagePreviewModal from '@/components/ui/ImagePreviewModal'
import { ModelCapabilityDropdown } from '@/components/ui/config-modals/ModelCapabilityDropdown'
import VideoTimelinePanel from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video-stage/VideoTimelinePanel'
import VideoRenderPanel from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video-stage/VideoRenderPanel'
import type { VideoStageShellProps } from './video-stage-runtime/types'
import {
  type EffectiveVideoCapabilityDefinition,
  normalizeVideoGenerationSelections,
  resolveEffectiveVideoCapabilityDefinitions,
  resolveEffectiveVideoCapabilityFields,
} from '@/lib/model-capabilities/video-effective'
import { projectVideoPricingTiersByFixedSelections } from '@/lib/model-pricing/video-tier'
import { useVideoTaskStates } from './video-stage-runtime/useVideoTaskStates'
import { useVideoPanelsProjection } from './video-stage-runtime/useVideoPanelsProjection'
import { useVideoPromptState } from './video-stage-runtime/useVideoPromptState'
import { useVideoPanelLinking } from './video-stage-runtime/useVideoPanelLinking'
import { useVideoVoiceLines } from './video-stage-runtime/useVideoVoiceLines'
import { useVideoDownloadAll } from './video-stage-runtime/useVideoDownloadAll'
import { useVideoStageUiState } from './video-stage-runtime/useVideoStageUiState'
import { useVideoPanelViewport } from './video-stage-runtime/useVideoPanelViewport'
import { useVideoFirstLastFrameFlow } from './video-stage-runtime/useVideoFirstLastFrameFlow'
import { filterNormalVideoModelOptions } from '@/lib/model-capabilities/video-model-options'
import {
  buildVideoSubmissionKey,
  createVideoSubmissionBaseline,
  shouldResolveVideoSubmissionLock,
  type VideoSubmissionBaseline,
} from './video-stage-runtime/immediate-video-submission'

export type { VideoStageShellProps } from './video-stage-runtime/types'

type BatchCapabilityDefinition = EffectiveVideoCapabilityDefinition

interface BatchCapabilityField {
  field: string
  label: string
  labelKey?: string
  unitKey?: string
  options: VideoGenerationOptionValue[]
  disabledOptions?: VideoGenerationOptionValue[]
}

function toFieldLabel(field: string): string {
  return field.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase())
}

export function useVideoStageRuntime({
  projectId,
  episodeId,
  storyboards,
  clips,
  defaultVideoModel,
  capabilityOverrides,
  videoRatio = '16:9',
  userVideoModels,
  onGenerateVideo,
  onGenerateAllVideos,
  onBack,
  onUpdateVideoPrompt,
  onUpdatePanelVideoModel,
  onOpenAssetLibraryForCharacter,
  onEnterEditor,
}: VideoStageShellProps) {
  const t = useTranslations('video')

  const {
    panelVideoPreference,
    voiceLinesExpanded,
    previewImage,
    setPreviewImage,
    toggleVoiceLinesExpanded,
    toggleLipSyncVideo,
    closePreviewImage,
  } = useVideoStageUiState()

  const {
    panelRefs,
    highlightedPanelKey,
    locateVoiceLinePanel,
  } = useVideoPanelViewport()

  const lipSyncMutation = useLipSync(projectId, episodeId)
  const listEpisodeVideoUrlsMutation = useListProjectEpisodeVideoUrls(projectId)
  const updatePanelLinkMutation = useUpdateProjectPanelLink(projectId)
  const downloadRemoteBlobMutation = useDownloadRemoteBlob()
  const matchedVoiceLinesQuery = useMatchedVoiceLines(projectId, episodeId)

  const { panelVideoStates, panelLipStates } = useVideoTaskStates({
    projectId,
    storyboards,
  })
  const { allPanels } = useVideoPanelsProjection({
    storyboards,
    clips,
    panelVideoStates,
    panelLipStates,
  })

  const {
    savingPrompts,
    getLocalPrompt,
    updateLocalPrompt,
    savePrompt,
  } = useVideoPromptState({
    allPanels,
    onUpdateVideoPrompt,
  })

  const { linkedPanels, handleToggleLink } = useVideoPanelLinking({
    allPanels,
    updatePanelLinkMutation,
  })

  const {
    panelVoiceLines,
    allVoiceLines,
    runningVoiceLineIds,
    reloadVoiceLines,
  } = useVideoVoiceLines({
    projectId,
    matchedVoiceLinesQuery,
  })

  const {
    isDownloading,
    videosWithUrl,
    handleDownloadAllVideos,
  } = useVideoDownloadAll({
    episodeId,
    t: (key) => t(key as never),
    allPanels,
    panelVideoPreference,
    listEpisodeVideoUrlsMutation,
    downloadRemoteBlobMutation,
  })

  const allVideoModelOptions = useMemo(
    () => userVideoModels || [],
    [userVideoModels],
  )
  const normalVideoModelOptions = useMemo(
    () => filterNormalVideoModelOptions(allVideoModelOptions),
    [allVideoModelOptions],
  )

  const safeTranslate = useCallback((key: string | undefined, fallback = ''): string => {
    if (!key) return fallback
    try {
      return t(key as never)
    } catch {
      return fallback
    }
  }, [t])

  const renderCapabilityLabel = useCallback((field: {
    field: string
    label: string
    labelKey?: string
    unitKey?: string
  }): string => {
    const labelText = safeTranslate(field.labelKey, safeTranslate(`capability.${field.field}`, field.label))
    const unitText = safeTranslate(field.unitKey)
    return unitText ? `${labelText} (${unitText})` : labelText
  }, [safeTranslate])

  const [isBatchConfigOpen, setIsBatchConfigOpen] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const [isSubmittingVideoBatch, setIsSubmittingVideoBatch] = useState(false)
  const [submittingVideoPanelKeys, setSubmittingVideoPanelKeys] = useState<Set<string>>(new Set())
  const [submittingVideoBaselines, setSubmittingVideoBaselines] = useState<Map<string, VideoSubmissionBaseline>>(new Map())
  const [batchSelectedModel, setBatchSelectedModel] = useState('')
  const [batchGenerationOptions, setBatchGenerationOptions] = useState<VideoGenerationOptions>({})

  useEffect(() => {
    if (normalVideoModelOptions.length === 0) {
      if (batchSelectedModel) setBatchSelectedModel('')
      return
    }
    if (normalVideoModelOptions.some((model) => model.value === batchSelectedModel)) return

    const nextDefault = normalVideoModelOptions.some((model) => model.value === defaultVideoModel)
      ? defaultVideoModel
      : (normalVideoModelOptions[0]?.value || '')
    setBatchSelectedModel(nextDefault)
  }, [normalVideoModelOptions, batchSelectedModel, defaultVideoModel])

  const selectedBatchModelOption = useMemo<VideoModelOption | undefined>(
    () => normalVideoModelOptions.find((option) => option.value === batchSelectedModel),
    [normalVideoModelOptions, batchSelectedModel],
  )
  const batchPricingTiers = useMemo(
    () => projectVideoPricingTiersByFixedSelections({
      tiers: selectedBatchModelOption?.videoPricingTiers ?? [],
      fixedSelections: {
        generationMode: 'normal',
      },
    }),
    [selectedBatchModelOption?.videoPricingTiers],
  )

  const batchCapabilityDefinitions = useMemo<BatchCapabilityDefinition[]>(() => {
    return resolveEffectiveVideoCapabilityDefinitions({
      videoCapabilities: selectedBatchModelOption?.capabilities?.video,
      pricingTiers: batchPricingTiers,
    })
  }, [batchPricingTiers, selectedBatchModelOption?.capabilities?.video])

  useEffect(() => {
    setBatchGenerationOptions((previous) => {
      return normalizeVideoGenerationSelections({
        definitions: batchCapabilityDefinitions,
        pricingTiers: batchPricingTiers,
        selection: previous,
      })
    })
  }, [batchCapabilityDefinitions, batchPricingTiers])

  const batchEffectiveCapabilityFields = useMemo(
    () => resolveEffectiveVideoCapabilityFields({
      definitions: batchCapabilityDefinitions,
      pricingTiers: batchPricingTiers,
      selection: batchGenerationOptions,
    }),
    [batchCapabilityDefinitions, batchGenerationOptions, batchPricingTiers],
  )

  const batchEffectiveFieldMap = useMemo(
    () => new Map(batchEffectiveCapabilityFields.map((field) => [field.field, field])),
    [batchEffectiveCapabilityFields],
  )
  const batchDefinitionFieldMap = useMemo(
    () => new Map(batchCapabilityDefinitions.map((definition) => [definition.field, definition])),
    [batchCapabilityDefinitions],
  )

  const batchCapabilityFields = useMemo<BatchCapabilityField[]>(() => {
    return batchCapabilityDefinitions.map((definition) => {
      const effectiveField = batchEffectiveFieldMap.get(definition.field)
      const enabledOptions = effectiveField?.options ?? []
      return {
        field: definition.field,
        label: toFieldLabel(definition.field),
        labelKey: definition.fieldI18n?.labelKey,
        unitKey: definition.fieldI18n?.unitKey,
        options: definition.options as VideoGenerationOptionValue[],
        disabledOptions: (definition.options as VideoGenerationOptionValue[])
          .filter((option) => !enabledOptions.includes(option)),
      }
    })
  }, [batchCapabilityDefinitions, batchEffectiveFieldMap])

  const batchMissingCapabilityFields = useMemo(
    () => batchEffectiveCapabilityFields
      .filter((field) => field.options.length === 0 || field.value === undefined)
      .map((field) => field.field),
    [batchEffectiveCapabilityFields],
  )

  const setBatchCapabilityValue = useCallback((field: string, rawValue: string) => {
    const capabilityDefinition = batchDefinitionFieldMap.get(field)
    if (!capabilityDefinition || capabilityDefinition.options.length === 0) return
    const sample = capabilityDefinition.options[0]
    const parsedValue =
      typeof sample === 'number'
        ? Number(rawValue)
        : typeof sample === 'boolean'
          ? rawValue === 'true'
          : rawValue
    if (!capabilityDefinition.options.includes(parsedValue)) return
    setBatchGenerationOptions((previous) => ({
      ...normalizeVideoGenerationSelections({
        definitions: batchCapabilityDefinitions,
        pricingTiers: batchPricingTiers,
        selection: {
          ...previous,
          [field]: parsedValue,
        },
        pinnedFields: [field],
      }),
    }))
  }, [batchCapabilityDefinitions, batchDefinitionFieldMap, batchPricingTiers])

  const handleLipSync = useCallback(async (
    storyboardId: string,
    panelIndex: number,
    voiceLineId: string,
    panelId?: string,
  ) => {
    try {
      await lipSyncMutation.mutateAsync({
        storyboardId,
        panelIndex,
        voiceLineId,
        panelId,
      })
    } catch (error: unknown) {
      _ulogError('Lip sync error:', error)
      throw error
    }
  }, [lipSyncMutation])

  const panelBySubmissionKey = useMemo(() => {
    const next = new Map<string, (typeof allPanels)[number]>()
    for (const panel of allPanels) {
      next.set(buildVideoSubmissionKey(panel), panel)
    }
    return next
  }, [allPanels])

  const handleGenerateVideoWithImmediateLock = useCallback(async (
    storyboardId: string,
    panelIndex: number,
    videoModel?: string,
    firstLastFrame?: {
      lastFrameStoryboardId: string
      lastFramePanelIndex: number
      flModel: string
      customPrompt?: string
    },
    generationOptions?: VideoGenerationOptions,
    panelId?: string,
  ) => {
    if (isSubmittingVideoBatch) return

    const panelKey = buildVideoSubmissionKey({ panelId, storyboardId, panelIndex })
    const currentPanel = panelBySubmissionKey.get(panelKey)
    if (currentPanel?.videoTaskRunning || submittingVideoPanelKeys.has(panelKey)) return

    setSubmittingVideoPanelKeys((previous) => {
      if (previous.has(panelKey)) return previous
      const next = new Set(previous)
      next.add(panelKey)
      return next
    })
    if (currentPanel) {
      setSubmittingVideoBaselines((previous) => {
        const next = new Map(previous)
        next.set(panelKey, createVideoSubmissionBaseline(currentPanel))
        return next
      })
    }

    try {
      await onGenerateVideo(storyboardId, panelIndex, videoModel, firstLastFrame, generationOptions, panelId)
    } catch (error) {
      setSubmittingVideoPanelKeys((previous) => {
        if (!previous.has(panelKey)) return previous
        const next = new Set(previous)
        next.delete(panelKey)
        return next
      })
      setSubmittingVideoBaselines((previous) => {
        if (!previous.has(panelKey)) return previous
        const next = new Map(previous)
        next.delete(panelKey)
        return next
      })
      throw error
    }
  }, [
    isSubmittingVideoBatch,
    onGenerateVideo,
    panelBySubmissionKey,
    submittingVideoPanelKeys,
  ])

  const {
    flModel,
    flModelOptions,
    flGenerationOptions,
    flCapabilityFields,
    flMissingCapabilityFields,
    flCustomPrompts,
    setFlModel,
    setFlCapabilityValue,
    setFlCustomPrompt,
    resetFlCustomPrompt,
    handleGenerateFirstLastFrame,
    getDefaultFlPrompt,
    getNextPanel,
    isLinkedAsLastFrame,
  } = useVideoFirstLastFrameFlow({
    allPanels,
    linkedPanels,
    videoModelOptions: allVideoModelOptions,
    onGenerateVideo: handleGenerateVideoWithImmediateLock,
    t: (key) => t(key as never),
  })

  useEffect(() => {
    if (submittingVideoPanelKeys.size === 0) return

    const now = Date.now()
    setSubmittingVideoPanelKeys((previous) => {
      let changed = false
      const next = new Set(previous)
      for (const key of previous) {
        if (!shouldResolveVideoSubmissionLock(panelBySubmissionKey.get(key), submittingVideoBaselines.get(key), now)) {
          continue
        }
        next.delete(key)
        changed = true
      }
      return changed ? next : previous
    })
    setSubmittingVideoBaselines((previous) => {
      let changed = false
      const next = new Map(previous)
      for (const key of previous.keys()) {
        if (submittingVideoPanelKeys.has(key) && !shouldResolveVideoSubmissionLock(panelBySubmissionKey.get(key), previous.get(key), now)) {
          continue
        }
        next.delete(key)
        changed = true
      }
      return changed ? next : previous
    })
  }, [panelBySubmissionKey, submittingVideoBaselines, submittingVideoPanelKeys])

  useEffect(() => {
    if (!isSubmittingVideoBatch || allPanels.some((panel) => panel.videoTaskRunning)) {
      if (isSubmittingVideoBatch && allPanels.some((panel) => panel.videoTaskRunning)) {
        setIsSubmittingVideoBatch(false)
      }
      return
    }

    const timeoutId = window.setTimeout(() => {
      setIsSubmittingVideoBatch(false)
    }, 90_000)
    return () => window.clearTimeout(timeoutId)
  }, [allPanels, isSubmittingVideoBatch])

  const handleGenerateAllVideosWithImmediateLock = useCallback(async (options?: Parameters<typeof onGenerateAllVideos>[0]) => {
    if (isSubmittingVideoBatch) return
    setIsSubmittingVideoBatch(true)
    try {
      await onGenerateAllVideos(options)
    } catch (error) {
      setIsSubmittingVideoBatch(false)
      throw error
    }
  }, [isSubmittingVideoBatch, onGenerateAllVideos])

  const projectedPanels = useMemo(() => (
    allPanels.map((panel) => {
      const panelKey = buildVideoSubmissionKey(panel)
      if (!isSubmittingVideoBatch && !submittingVideoPanelKeys.has(panelKey)) return panel
      return {
        ...panel,
        videoTaskRunning: true,
      }
    })
  ), [allPanels, isSubmittingVideoBatch, submittingVideoPanelKeys])

  const runningCount = projectedPanels.filter((panel) => panel.videoTaskRunning || panel.lipSyncTaskRunning).length
  const failedCount = allPanels.filter((panel) => !!panel.videoErrorMessage || !!panel.lipSyncErrorMessage).length
  const isAnyTaskRunning = runningCount > 0 || isSubmittingVideoBatch
  const canSubmitBatchGenerate = !!batchSelectedModel && batchMissingCapabilityFields.length === 0

  const handleOpenBatchGenerateModal = useCallback(() => {
    if (isAnyTaskRunning) return
    setIsBatchConfigOpen(true)
  }, [isAnyTaskRunning])

  const handleCloseBatchGenerateModal = useCallback(() => {
    setIsBatchConfigOpen(false)
  }, [])

  const handleConfirmBatchGenerate = useCallback(async () => {
    if (!canSubmitBatchGenerate || isConfirming) return

    setIsConfirming(true)
    try {
      await handleGenerateAllVideosWithImmediateLock({
        videoModel: batchSelectedModel,
        generationOptions: batchGenerationOptions,
      })
      setIsBatchConfigOpen(false)
    } finally {
      setIsConfirming(false)
    }
  }, [
    batchGenerationOptions,
    batchSelectedModel,
    canSubmitBatchGenerate,
    handleGenerateAllVideosWithImmediateLock,
    isConfirming,
  ])

  return (
    <div className="space-y-6 pb-20">
      <VideoToolbar
        totalPanels={projectedPanels.length}
        runningCount={runningCount}
        videosWithUrl={videosWithUrl}
        failedCount={failedCount}
        isAnyTaskRunning={isAnyTaskRunning}
        isDownloading={isDownloading}
        onGenerateAll={handleOpenBatchGenerateModal}
        onDownloadAll={handleDownloadAllVideos}
        onBack={onBack}
        onEnterEditor={onEnterEditor}
        videosReady={videosWithUrl > 0}
      />

      <VideoTimelinePanel
        projectId={projectId}
        episodeId={episodeId}
        allVoiceLines={allVoiceLines}
        expanded={voiceLinesExpanded}
        onToggleExpanded={toggleVoiceLinesExpanded}
        onReloadVoiceLines={reloadVoiceLines}
        onLocateVoiceLine={locateVoiceLinePanel}
        onOpenAssetLibraryForCharacter={onOpenAssetLibraryForCharacter}
      />

      <VideoRenderPanel
        allPanels={projectedPanels}
        linkedPanels={linkedPanels}
        highlightedPanelKey={highlightedPanelKey}
        panelRefs={panelRefs}
        videoRatio={videoRatio}
        defaultVideoModel={defaultVideoModel}
        capabilityOverrides={capabilityOverrides}
        userVideoModels={normalVideoModelOptions}
        projectId={projectId}
        episodeId={episodeId}
        runningVoiceLineIds={runningVoiceLineIds}
        panelVoiceLines={panelVoiceLines}
        panelVideoPreference={panelVideoPreference}
        savingPrompts={savingPrompts}
        flModel={flModel}
        flModelOptions={flModelOptions}
        flGenerationOptions={flGenerationOptions}
        flCapabilityFields={flCapabilityFields}
        flMissingCapabilityFields={flMissingCapabilityFields}
        flCustomPrompts={flCustomPrompts}
        onGenerateVideo={handleGenerateVideoWithImmediateLock}
        onUpdatePanelVideoModel={onUpdatePanelVideoModel}
        onLipSync={handleLipSync}
        onToggleLink={handleToggleLink}
        onFlModelChange={setFlModel}
        onFlCapabilityChange={setFlCapabilityValue}
        onFlCustomPromptChange={setFlCustomPrompt}
        onResetFlPrompt={resetFlCustomPrompt}
        onGenerateFirstLastFrame={handleGenerateFirstLastFrame}
        onPreviewImage={setPreviewImage}
        onToggleLipSyncVideo={toggleLipSyncVideo}
        getNextPanel={getNextPanel}
        isLinkedAsLastFrame={isLinkedAsLastFrame}
        getDefaultFlPrompt={getDefaultFlPrompt}
        getLocalPrompt={getLocalPrompt}
        updateLocalPrompt={updateLocalPrompt}
        savePrompt={savePrompt}
      />

      {isBatchConfigOpen && (
        <div
          className="fixed inset-0 z-[120] glass-overlay flex items-center justify-center p-4"
          onClick={handleCloseBatchGenerateModal}
        >
          <div
            className="glass-surface-modal w-full max-w-2xl p-5 space-y-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-[var(--glass-text-primary)]">
                {t('toolbar.batchConfigTitle')}
              </h3>
              <p className="text-sm text-[var(--glass-text-tertiary)]">
                {t('toolbar.batchConfigDesc')}
              </p>
            </div>

            <ModelCapabilityDropdown
              models={normalVideoModelOptions}
              value={batchSelectedModel || undefined}
              onModelChange={setBatchSelectedModel}
              capabilityFields={batchCapabilityFields.map((field) => ({
                field: field.field,
                label: renderCapabilityLabel(field),
                options: field.options,
                disabledOptions: field.disabledOptions,
              }))}
              capabilityOverrides={batchGenerationOptions}
              onCapabilityChange={(field, rawValue) => setBatchCapabilityValue(field, rawValue)}
              placeholder={t('panelCard.selectModel')}
            />

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={handleCloseBatchGenerateModal}
                className="glass-btn-base glass-btn-secondary px-4 py-2 text-sm font-medium"
              >
                {t('panelCard.cancel')}
              </button>
              <button
                type="button"
                onClick={() => { void handleConfirmBatchGenerate() }}
                disabled={!canSubmitBatchGenerate || isConfirming}
                className="glass-btn-base glass-btn-primary px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isConfirming ? (
                  <>
                    <AppIcon name="loader" className="animate-spin h-4 w-4" />
                    <span>{t('toolbar.confirming')}</span>
                  </>
                ) : (
                  <span>{t('toolbar.confirmGenerateAll')}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {previewImage && <ImagePreviewModal imageUrl={previewImage} onClose={closePreviewImage} />}
    </div>
  )
}
