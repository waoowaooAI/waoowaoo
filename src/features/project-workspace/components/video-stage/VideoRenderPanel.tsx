import { getAspectRatioConfig } from '@/lib/constants'
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useTranslations } from 'next-intl'
import type { CapabilitySelections, CapabilityValue } from '@/lib/ai-registry/types'
import { AppIcon } from '@/components/ui/icons'
import { normalizeVideoGenerationSelections, projectVideoPricingTiersByFixedSelections, resolveEffectiveVideoCapabilityDefinitions, resolveEffectiveVideoCapabilityFields, type EffectiveVideoCapabilityDefinition } from '@/lib/ai-registry/video-capabilities'
import { InlineVideoGenerationControls, VideoPanelCard, type VideoPanel, type VideoModelOption, type MatchedVoiceLine, type FirstLastFrameParams, type VideoGenerationOptionValue, type VideoGenerationOptions } from '../video'
import type { PromptField } from '@/lib/project-workflow/stages/video-stage-runtime/useVideoPromptState'
import { useAdaptiveCardGrid } from '../layout/useAdaptiveCardGrid'

const VIDEO_GROUP_VIRTUALIZATION_THRESHOLD = 8
const ESTIMATED_VIDEO_GROUP_HEIGHT = 760

type GroupCapabilityDefinition = EffectiveVideoCapabilityDefinition

interface GroupCapabilityField {
  field: string
  label: string
  labelKey?: string
  unitKey?: string
  options: VideoGenerationOptionValue[]
  disabledOptions?: VideoGenerationOptionValue[]
}

interface VideoPanelGroupItem {
  panel: VideoPanel
  absoluteIndex: number
}

interface VideoPanelGroup {
  storyboardId: string
  groupNumber: number
  panels: VideoPanelGroupItem[]
}

interface VideoRenderPanelProps {
  allPanels: VideoPanel[]
  linkedPanels: Map<string, boolean>
  highlightedPanelKey: string | null
  panelRefs: MutableRefObject<Map<string, HTMLDivElement>>
  videoRatio: string
  defaultVideoModel: string
  capabilityOverrides: CapabilitySelections
  userVideoModels?: VideoModelOption[]
  projectId: string
  episodeId: string
  runningVoiceLineIds: Set<string>
  panelVoiceLines: Map<string, MatchedVoiceLine[]>
  panelVideoPreference: Map<string, boolean>
  savingPrompts: Set<string>
  flModel: string
  flModelOptions: VideoModelOption[]
  flGenerationOptions: VideoGenerationOptions
  flCapabilityFields: Array<{
    field: string
    label: string
    options: CapabilityValue[]
    disabledOptions?: CapabilityValue[]
    value: CapabilityValue | undefined
  }>
  flMissingCapabilityFields: string[]
  flCustomPrompts: Map<string, string>
  onGenerateVideo: (
    storyboardId: string,
    panelIndex: number,
    videoModel?: string,
    firstLastFrame?: FirstLastFrameParams,
    generationOptions?: VideoGenerationOptions,
    panelId?: string,
  ) => Promise<void>
  onUpdatePanelVideoModel: (storyboardId: string, panelIndex: number, model: string) => Promise<void>
  onLipSync: (storyboardId: string, panelIndex: number, voiceLineId: string, panelId?: string) => Promise<void>
  onToggleLink: (panelKey: string, storyboardId: string, panelIndex: number) => Promise<void>
  onFlModelChange: (model: string) => void
  onFlCapabilityChange: (field: string, rawValue: string) => void
  onFlCustomPromptChange: (key: string, value: string) => void
  onResetFlPrompt: (key: string) => void
  onGenerateFirstLastFrame: (
    firstStoryboardId: string,
    firstPanelIndex: number,
    lastStoryboardId: string,
    lastPanelIndex: number,
    panelKey: string,
    generationOptions?: VideoGenerationOptions,
    firstPanelId?: string,
  ) => Promise<void>
  onPreviewImage: (imageUrl: string | null) => void
  onToggleLipSyncVideo: (key: string, value: boolean) => void
  getNextPanel: (currentIndex: number) => VideoPanel | null
  isLinkedAsLastFrame: (currentIndex: number) => boolean
  getDefaultFlPrompt: (firstPrompt?: string, lastPrompt?: string) => string
  getLocalPrompt: (panelKey: string, externalPrompt?: string, field?: PromptField) => string
  updateLocalPrompt: (panelKey: string, value: string, field?: PromptField) => void
  savePrompt: (
    storyboardId: string,
    panelIndex: number,
    panelKey: string,
    value: string,
    field?: PromptField,
  ) => Promise<void>
}

function toFieldLabel(field: string): string {
  return field.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase())
}

function parseByOptionType(
  input: string,
  sample: VideoGenerationOptionValue,
): VideoGenerationOptionValue {
  if (typeof sample === 'number') return Number(input)
  if (typeof sample === 'boolean') return input === 'true'
  return input
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isGenerationOptionValue(value: unknown): value is VideoGenerationOptionValue {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

function readSelectionForModel(
  capabilityOverrides: CapabilitySelections | undefined,
  modelKey: string,
): VideoGenerationOptions {
  if (!modelKey || !capabilityOverrides) return {}
  const rawSelection = capabilityOverrides[modelKey]
  if (!isRecord(rawSelection)) return {}

  const selection: VideoGenerationOptions = {}
  for (const [field, value] of Object.entries(rawSelection)) {
    if (field === 'aspectRatio') continue
    if (!isGenerationOptionValue(value)) continue
    selection[field] = value
  }
  return selection
}

export default function VideoRenderPanel({
  allPanels,
  linkedPanels,
  highlightedPanelKey,
  panelRefs,
  videoRatio,
  defaultVideoModel,
  capabilityOverrides,
  userVideoModels,
  projectId,
  episodeId,
  runningVoiceLineIds,
  panelVoiceLines,
  panelVideoPreference,
  savingPrompts,
  flModel,
  flModelOptions,
  flGenerationOptions,
  flCapabilityFields,
  flMissingCapabilityFields,
  flCustomPrompts,
  onGenerateVideo,
  onUpdatePanelVideoModel,
  onLipSync,
  onToggleLink,
  onFlModelChange,
  onFlCapabilityChange,
  onFlCustomPromptChange,
  onResetFlPrompt,
  onGenerateFirstLastFrame,
  onPreviewImage,
  onToggleLipSyncVideo,
  getNextPanel,
  isLinkedAsLastFrame,
  getDefaultFlPrompt,
  getLocalPrompt,
  updateLocalPrompt,
  savePrompt,
}: VideoRenderPanelProps) {
  const t = useTranslations('video')
  const scrollParentRef = useRef<HTMLDivElement | null>(null)
  const isVerticalRatio = getAspectRatioConfig(videoRatio).isVertical
  const videoGrid = useAdaptiveCardGrid({
    itemCount: allPanels.length,
    minCardWidth: isVerticalRatio ? 220 : 300,
    maxCardWidth: isVerticalRatio ? 300 : 420,
  })
  const [submittingGroupId, setSubmittingGroupId] = useState<string | null>(null)
  const [groupSelectedModel, setGroupSelectedModel] = useState('')
  const [groupGenerationOptions, setGroupGenerationOptions] = useState<VideoGenerationOptions>({})

  const videoGroups = useMemo<VideoPanelGroup[]>(() => {
    const groups: VideoPanelGroup[] = []
    const groupByStoryboardId = new Map<string, VideoPanelGroup>()

    allPanels.forEach((panel, absoluteIndex) => {
      let group = groupByStoryboardId.get(panel.storyboardId)
      if (!group) {
        group = {
          storyboardId: panel.storyboardId,
          groupNumber: groups.length + 1,
          panels: [],
        }
        groupByStoryboardId.set(panel.storyboardId, group)
        groups.push(group)
      }
      group.panels.push({ panel, absoluteIndex })
    })

    return groups
  }, [allPanels])

  useEffect(() => {
    if (!userVideoModels || userVideoModels.length === 0) {
      if (groupSelectedModel) setGroupSelectedModel('')
      return
    }
    if (userVideoModels.some((model) => model.value === groupSelectedModel)) return

    const nextDefault = userVideoModels.some((model) => model.value === defaultVideoModel)
      ? defaultVideoModel
      : (userVideoModels[0]?.value || '')
    setGroupSelectedModel(nextDefault)
  }, [defaultVideoModel, groupSelectedModel, userVideoModels])

  const selectedGroupModelOption = useMemo<VideoModelOption | undefined>(
    () => userVideoModels?.find((option) => option.value === groupSelectedModel),
    [groupSelectedModel, userVideoModels],
  )
  const groupPricingTiers = useMemo(
    () => projectVideoPricingTiersByFixedSelections({
      tiers: selectedGroupModelOption?.videoPricingTiers ?? [],
      fixedSelections: {
        generationMode: 'normal',
      },
    }),
    [selectedGroupModelOption?.videoPricingTiers],
  )
  const groupCapabilityDefinitions = useMemo<GroupCapabilityDefinition[]>(() => {
    return resolveEffectiveVideoCapabilityDefinitions({
      videoCapabilities: selectedGroupModelOption?.capabilities?.video,
      pricingTiers: groupPricingTiers,
    })
  }, [groupPricingTiers, selectedGroupModelOption?.capabilities?.video])
  const selectedGroupModelOverrides = useMemo(
    () => readSelectionForModel(capabilityOverrides, groupSelectedModel),
    [capabilityOverrides, groupSelectedModel],
  )
  const selectedGroupModelOverridesSignature = useMemo(
    () => JSON.stringify(selectedGroupModelOverrides),
    [selectedGroupModelOverrides],
  )

  useEffect(() => {
    setGroupGenerationOptions(normalizeVideoGenerationSelections({
      definitions: groupCapabilityDefinitions,
      pricingTiers: groupPricingTiers,
      selection: selectedGroupModelOverrides,
    }))
  }, [
    groupCapabilityDefinitions,
    groupPricingTiers,
    groupSelectedModel,
    selectedGroupModelOverrides,
    selectedGroupModelOverridesSignature,
  ])

  useEffect(() => {
    setGroupGenerationOptions((previous) => normalizeVideoGenerationSelections({
      definitions: groupCapabilityDefinitions,
      pricingTiers: groupPricingTiers,
      selection: previous,
    }))
  }, [groupCapabilityDefinitions, groupPricingTiers])

  const groupEffectiveCapabilityFields = useMemo(
    () => resolveEffectiveVideoCapabilityFields({
      definitions: groupCapabilityDefinitions,
      pricingTiers: groupPricingTiers,
      selection: groupGenerationOptions,
    }),
    [groupCapabilityDefinitions, groupGenerationOptions, groupPricingTiers],
  )
  const groupEffectiveFieldMap = useMemo(
    () => new Map(groupEffectiveCapabilityFields.map((field) => [field.field, field])),
    [groupEffectiveCapabilityFields],
  )
  const groupDefinitionFieldMap = useMemo(
    () => new Map(groupCapabilityDefinitions.map((definition) => [definition.field, definition])),
    [groupCapabilityDefinitions],
  )
  const groupCapabilityFields = useMemo<GroupCapabilityField[]>(() => {
    return groupCapabilityDefinitions.map((definition) => {
      const effectiveField = groupEffectiveFieldMap.get(definition.field)
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
  }, [groupCapabilityDefinitions, groupEffectiveFieldMap])
  const groupMissingCapabilityFields = useMemo(
    () => groupEffectiveCapabilityFields
      .filter((field) => field.options.length === 0 || field.value === undefined)
      .map((field) => field.field),
    [groupEffectiveCapabilityFields],
  )

  const setGroupCapabilityValue = useCallback((field: string, rawValue: string) => {
    const capabilityDefinition = groupDefinitionFieldMap.get(field)
    if (!capabilityDefinition || capabilityDefinition.options.length === 0) return
    const parsedValue = parseByOptionType(rawValue, capabilityDefinition.options[0])
    if (!capabilityDefinition.options.includes(parsedValue)) return
    setGroupGenerationOptions((previous) => ({
      ...normalizeVideoGenerationSelections({
        definitions: groupCapabilityDefinitions,
        pricingTiers: groupPricingTiers,
        selection: {
          ...previous,
          [field]: parsedValue,
        },
        pinnedFields: [field],
      }),
    }))
  }, [groupCapabilityDefinitions, groupDefinitionFieldMap, groupPricingTiers])

  const handleConfirmGroupBatch = useCallback(async (group: VideoPanelGroup) => {
    const groupTargets = group.panels.filter(({ panel }) => panel.imageUrl && !panel.videoTaskRunning)
    if (
      !groupSelectedModel
      || groupMissingCapabilityFields.length > 0
      || groupTargets.length === 0
      || submittingGroupId
    ) return

    setSubmittingGroupId(group.storyboardId)
    try {
      for (const { panel } of groupTargets) {
        await onGenerateVideo(
          panel.storyboardId,
          panel.panelIndex,
          groupSelectedModel,
          undefined,
          groupGenerationOptions,
          panel.panelId,
        )
      }
    } finally {
      setSubmittingGroupId(null)
    }
  }, [
    groupGenerationOptions,
    groupMissingCapabilityFields.length,
    groupSelectedModel,
    onGenerateVideo,
    submittingGroupId,
  ])

  const groupVirtualizer = useVirtualizer({
    count: videoGroups.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => ESTIMATED_VIDEO_GROUP_HEIGHT,
    overscan: 2,
  })

  const renderVideoGroup = (group: VideoPanelGroup) => {
    const groupPanelsWithImages = group.panels.filter(({ panel }) => panel.imageUrl).length
    const groupHasRunningVideo = group.panels.some(({ panel }) => panel.videoTaskRunning)
    const isSubmittingThisGroup = submittingGroupId === group.storyboardId

    return (
      <section data-video-group-id={group.storyboardId} className="space-y-3">
        <div
          className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--glass-stroke-base)] pb-2"
          style={videoGrid.contentStyle}
        >
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[var(--glass-text-primary)]">
              {t('groupBatch.title', { number: group.groupNumber })}
            </h3>
            <p className="text-xs text-[var(--glass-text-tertiary)]">
              {t('groupBatch.summary', {
                total: group.panels.length,
                ready: groupPanelsWithImages,
              })}
            </p>
          </div>
          <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
            <InlineVideoGenerationControls
              models={userVideoModels ?? []}
              modelValue={groupSelectedModel}
              onModelChange={setGroupSelectedModel}
              capabilityFields={groupCapabilityFields}
              capabilityOverrides={groupGenerationOptions}
              onCapabilityChange={setGroupCapabilityValue}
              fields={['resolution']}
              disabled={groupHasRunningVideo || !!submittingGroupId}
              className="flex-none"
              size="xs"
              wrap={false}
            />
            <button
              type="button"
              onClick={() => { void handleConfirmGroupBatch(group) }}
              disabled={
                groupPanelsWithImages === 0
                || groupHasRunningVideo
                || !!submittingGroupId
                || !groupSelectedModel
                || groupMissingCapabilityFields.length > 0
              }
              className="glass-btn-base glass-btn-primary h-8 px-3 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              title={t('groupBatch.open')}
            >
              {isSubmittingThisGroup ? (
                <AppIcon name="loader" className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <AppIcon name="plus" className="h-3.5 w-3.5" />
              )}
              <span>{t('groupBatch.open')}</span>
            </button>
          </div>
        </div>

        <div
          className="grid gap-4"
          style={{ ...videoGrid.contentStyle, ...videoGrid.gridStyle }}
        >
          {group.panels.map(({ panel, absoluteIndex }) => {
            const panelKey = `${panel.storyboardId}-${panel.panelIndex}`
            const isLinked = linkedPanels.get(panelKey) || false
            const isLastFrame = isLinkedAsLastFrame(absoluteIndex)
            const nextPanel = getNextPanel(absoluteIndex)
            const prevPanel = absoluteIndex > 0 ? allPanels[absoluteIndex - 1] : null
            const hasNext = absoluteIndex < allPanels.length - 1
            const promptField: PromptField = isLinked ? 'firstLastFramePrompt' : 'videoPrompt'
            const defaultFlPrompt = getDefaultFlPrompt(panel.textPanel?.video_prompt, nextPanel?.textPanel?.video_prompt)
            const externalPrompt = isLinked
              ? (panel.firstLastFramePrompt || defaultFlPrompt)
              : panel.textPanel?.video_prompt
            const localPrompt = getLocalPrompt(panelKey, externalPrompt, promptField)
            const isSavingPrompt = savingPrompts.has(`${promptField}:${panelKey}`)

            return (
              <div
                key={panelKey}
                ref={(element) => {
                  if (element) panelRefs.current.set(panelKey, element)
                  else panelRefs.current.delete(panelKey)
                }}
                className={`transition-all duration-500 ${highlightedPanelKey === panelKey
                  ? 'ring-4 ring-[var(--glass-stroke-focus)] ring-offset-2 ring-offset-[var(--glass-bg-canvas)] rounded-2xl scale-[1.02]'
                  : ''
                }`}
              >
                <VideoPanelCard
                  panel={{
                    ...panel,
                    lipSyncTaskRunning: panel.lipSyncTaskRunning || false,
                  }}
                  panelIndex={absoluteIndex}
                  defaultVideoModel={defaultVideoModel}
                  capabilityOverrides={capabilityOverrides}
                  videoRatio={videoRatio}
                  userVideoModels={userVideoModels}
                  projectId={projectId}
                  episodeId={episodeId}
                  runningVoiceLineIds={runningVoiceLineIds}
                  matchedVoiceLines={panelVoiceLines.get(panelKey) || []}
                  onLipSync={onLipSync}
                  showLipSyncVideo={panelVideoPreference.get(panelKey) ?? true}
                  onToggleLipSyncVideo={onToggleLipSyncVideo}
                  isLinked={isLinked}
                  isLastFrame={isLastFrame}
                  nextPanel={nextPanel}
                  prevPanel={prevPanel}
                  hasNext={hasNext}
                  flModel={flModel}
                  flModelOptions={flModelOptions}
                  flGenerationOptions={flGenerationOptions}
                  flCapabilityFields={flCapabilityFields}
                  flMissingCapabilityFields={flMissingCapabilityFields}
                  flCustomPrompt={flCustomPrompts.get(panelKey) || panel.firstLastFramePrompt || ''}
                  defaultFlPrompt={defaultFlPrompt}
                  localPrompt={localPrompt}
                  isSavingPrompt={isSavingPrompt}
                  onUpdateLocalPrompt={(value) => {
                    updateLocalPrompt(panelKey, value, promptField)
                    if (isLinked) onFlCustomPromptChange(panelKey, value)
                  }}
                  onSavePrompt={(value) => savePrompt(panel.storyboardId, panel.panelIndex, panelKey, value, promptField)}
                  onGenerateVideo={onGenerateVideo}
                  onUpdatePanelVideoModel={onUpdatePanelVideoModel}
                  onToggleLink={onToggleLink}
                  onFlModelChange={onFlModelChange}
                  onFlCapabilityChange={onFlCapabilityChange}
                  onFlCustomPromptChange={onFlCustomPromptChange}
                  onResetFlPrompt={onResetFlPrompt}
                  onGenerateFirstLastFrame={onGenerateFirstLastFrame}
                  onPreviewImage={onPreviewImage}
                />
              </div>
            )
          })}
        </div>
      </section>
    )
  }

  if (videoGroups.length > VIDEO_GROUP_VIRTUALIZATION_THRESHOLD) {
    return (
      <div ref={videoGrid.containerRef} className="w-full">
        <div
          ref={scrollParentRef}
          data-testid="video-stage-virtualized-list"
          className="max-h-[calc(100vh-14rem)] overflow-y-auto pr-2"
        >
          <div
            className="relative w-full"
            style={{ height: groupVirtualizer.getTotalSize() }}
          >
            {groupVirtualizer.getVirtualItems().map((virtualItem) => {
              const group = videoGroups[virtualItem.index]
              if (!group) return null
              return (
                <div
                  key={group.storyboardId}
                  data-index={virtualItem.index}
                  ref={groupVirtualizer.measureElement}
                  className="absolute left-0 top-0 w-full"
                  style={{ transform: `translateY(${virtualItem.start}px)` }}
                >
                  {renderVideoGroup(group)}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div ref={videoGrid.containerRef} className="w-full space-y-6">
      {videoGroups.map((group) => (
        <div key={group.storyboardId}>
          {renderVideoGroup(group)}
        </div>
      ))}

    </div>
  )
}
