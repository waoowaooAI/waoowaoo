'use client'
import { useTranslations } from 'next-intl'

import type { VideoGenerationOptions, VideoModelOption, VideoPanel } from './types'
import type { CapabilityValue } from '@/lib/model-config-contract'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import { MediaImageWithLoading } from '@/components/media/MediaImageWithLoading'
import { ModelCapabilityDropdown } from '@/components/ui/config-modals/ModelCapabilityDropdown'
import { AppIcon } from '@/components/ui/icons'

interface FirstLastFramePanelProps {
  panel: VideoPanel
  nextPanel: VideoPanel
  panelIndex: number
  panelKey: string
  isVideoTaskRunning: boolean
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
  customPrompt: string
  defaultPrompt: string
  hasMissingCapabilities?: boolean
  videoRatio?: string  // 视频比例，如 "16:9", "3:2" 等
  onFlModelChange: (model: string) => void
  onFlCapabilityChange: (field: string, rawValue: string) => void
  onCustomPromptChange: (panelKey: string, value: string) => void
  onResetPrompt: (panelKey: string) => void
  onToggleLink: (panelKey: string, storyboardId: string, panelIndex: number) => void
  onGenerate: (
    firstStoryboardId: string,
    firstPanelIndex: number,
    lastStoryboardId: string,
    lastPanelIndex: number,
    panelKey: string,
    generationOptions?: VideoGenerationOptions,
    firstPanelId?: string,
  ) => void
  onPreviewImage?: (imageUrl: string) => void
}

export default function FirstLastFramePanel({
  panel,
  nextPanel,
  panelIndex,
  panelKey,
  isVideoTaskRunning,
  flModel,
  flModelOptions,
  flGenerationOptions,
  flCapabilityFields,
  customPrompt,
  defaultPrompt,
  hasMissingCapabilities = false,
  videoRatio = '16:9',
  onFlModelChange,
  onFlCapabilityChange,
  onCustomPromptChange,
  onResetPrompt,
  onToggleLink,
  onGenerate,
  onPreviewImage
}: FirstLastFramePanelProps) {
  const t = useTranslations('video')
  const renderCapabilityLabel = (field: string, fallback: string): string => {
    try {
      return t(`capability.${field}` as never)
    } catch {
      return fallback
    }
  }
  const isFirstLastFrameGenerated = panel.videoGenerationMode === 'firstlastframe' && !!panel.videoUrl
  const videoTaskRunningState = isVideoTaskRunning
    ? resolveTaskPresentationState({
      phase: 'processing',
      intent: isFirstLastFrameGenerated ? 'regenerate' : 'generate',
      resource: 'video',
      hasOutput: isFirstLastFrameGenerated,
    })
    : null
  const currentPrompt = customPrompt || defaultPrompt
  const hasCustomPrompt = customPrompt !== ''

  // 根据视频比例设置 aspect ratio（支持任意比例）
  const cssAspectRatio = videoRatio.replace(':', '/')

  return (
    <div className="mb-2 space-y-2">
      <div className="p-2 bg-[var(--glass-tone-info-bg)] border border-[var(--glass-stroke-focus)] rounded-lg">
        <div className="flex items-center gap-2 text-xs text-[var(--glass-tone-info-fg)] mb-2">
          <span>{t("firstLastFrame.title")}</span>
          <span className="text-[var(--glass-tone-info-fg)]">{t("firstLastFrame.range", { from: panelIndex + 1, to: panelIndex + 2 })}</span>
          <button
            onClick={() => onToggleLink(panelKey, panel.storyboardId, panel.panelIndex)}
            className="ml-auto text-[var(--glass-tone-info-fg)] hover:text-[var(--glass-text-primary)] underline"
          >
            {t("firstLastFrame.unlinkAction")}
          </button>
        </div>
        <div className="flex gap-2 items-center">
          <div className="flex-1 bg-[var(--glass-bg-muted)] rounded overflow-hidden relative" style={{ aspectRatio: cssAspectRatio }}>
            {panel.imageUrl && (
              <MediaImageWithLoading
                src={panel.imageUrl}
                alt={t("firstLastFrame.firstFrame")}
                containerClassName="w-full h-full"
                className={`w-full h-full object-cover ${onPreviewImage ? 'cursor-zoom-in' : ''}`}
                onClick={() => {
                  if (panel.imageUrl) onPreviewImage?.(panel.imageUrl)
                }}
              />
            )}
            <span className="absolute bottom-1 left-1 bg-[var(--glass-accent-from)] text-white text-[10px] px-1 rounded">{t("firstLastFrame.firstFrame")}</span>
          </div>
          <AppIcon name="arrowRight" className="w-4 h-4 text-[var(--glass-tone-info-fg)]" />
          <div className="flex-1 bg-[var(--glass-bg-muted)] rounded overflow-hidden relative" style={{ aspectRatio: cssAspectRatio }}>
            {nextPanel.imageUrl && (
              <MediaImageWithLoading
                src={nextPanel.imageUrl}
                alt={t("firstLastFrame.lastFrame")}
                containerClassName="w-full h-full"
                className={`w-full h-full object-cover ${onPreviewImage ? 'cursor-zoom-in' : ''}`}
                onClick={() => {
                  if (nextPanel.imageUrl) onPreviewImage?.(nextPanel.imageUrl)
                }}
              />
            )}
            <span className="absolute bottom-1 left-1 bg-[var(--glass-tone-warning-fg)] text-white text-[10px] px-1 rounded">{t("firstLastFrame.lastFrame")}</span>
          </div>
        </div>
        {/* 首尾帧提示词编辑 */}
        <div className="mt-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-[var(--glass-tone-info-fg)] font-medium">{t("firstLastFrame.customPrompt")}</span>
            {hasCustomPrompt && (
              <button
                onClick={() => onResetPrompt(panelKey)}
                className="text-xs text-[var(--glass-tone-info-fg)] hover:text-[var(--glass-tone-info-fg)] underline"
              >
                {t("firstLastFrame.useDefault")}
              </button>
            )}
          </div>
          <textarea
            value={currentPrompt}
            onChange={(e) => onCustomPromptChange(panelKey, e.target.value)}
            className="w-full text-xs p-2 border border-[var(--glass-stroke-focus)] rounded bg-[var(--glass-bg-surface)] text-[var(--glass-text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--glass-tone-info-fg)] resize-none"
            rows={3}
            placeholder={t("firstLastFrame.promptPlaceholder")}
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onGenerate(panel.storyboardId, panel.panelIndex, nextPanel.storyboardId, nextPanel.panelIndex, panelKey, flGenerationOptions, panel.panelId)}
          disabled={isVideoTaskRunning || !panel.imageUrl || !nextPanel.imageUrl || !flModel || hasMissingCapabilities}
          className={`glass-btn-base flex-1 py-2 text-sm font-medium disabled:opacity-50 ${isFirstLastFrameGenerated
            ? 'bg-[var(--glass-tone-success-fg)] text-white'
            : isVideoTaskRunning
              ? 'bg-[var(--glass-bg-muted)] text-[var(--glass-text-tertiary)]'
              : 'bg-[var(--glass-accent-from)] text-white hover:bg-[var(--glass-accent-to)]'
            }`}
        >
          {isFirstLastFrameGenerated ? t("firstLastFrame.generated") : isVideoTaskRunning ? (
            <TaskStatusInline state={videoTaskRunningState} className="text-white [&>span]:text-white [&_svg]:text-white" />
          ) : t("firstLastFrame.generate")}
        </button>
        <div className="min-w-[220px] max-w-[280px]">
          <ModelCapabilityDropdown
            compact
            models={flModelOptions}
            value={flModel || undefined}
            onModelChange={onFlModelChange}
            capabilityFields={flCapabilityFields.map((field) => ({
              field: field.field,
              label: renderCapabilityLabel(field.field, field.label),
              options: field.options,
              disabledOptions: field.disabledOptions,
            }))}
            capabilityOverrides={flGenerationOptions}
            onCapabilityChange={(field, rawValue) => onFlCapabilityChange(field, rawValue)}
            placeholder={t('panelCard.selectModel')}
          />
        </div>
      </div>
    </div>
  )
}
