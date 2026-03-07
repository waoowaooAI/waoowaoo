'use client'
import { useTranslations } from 'next-intl'

import { useState } from 'react'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import { MediaImageWithLoading } from '@/components/media/MediaImageWithLoading'
import { AppIcon } from '@/components/ui/icons'

interface CandidateSelectorProps {
  originalImageUrl: string | null
  candidates: string[]
  selectedIndex: number  // 0 = 原图, 1-n = 候选图
  videoRatio: string  // 完整比例字符串，如 "16:9", "3:2" 等
  onSelect: (index: number) => void
  onConfirm: () => void
  onCancel: () => void
  onPreview: (imageUrl: string) => void
  getImageUrl: (url: string | null) => string | null
}

export default function CandidateSelector({
  originalImageUrl,
  candidates,
  selectedIndex,
  videoRatio,
  onSelect,
  onConfirm,
  onCancel,
  onPreview,
  getImageUrl
}: CandidateSelectorProps) {
  const t = useTranslations('storyboard')
  const [isConfirming, setIsConfirming] = useState(false)
  const confirmingState = isConfirming
    ? resolveTaskPresentationState({
      phase: 'processing',
      intent: 'process',
      resource: 'image',
      hasOutput: true,
    })
    : null

  // 根据比例计算缩略图尺寸（固定宽度 120px）
  const [w, h] = videoRatio.split(':').map(Number)
  const thumbWidth = 120
  const thumbHeight = Math.round(thumbWidth * h / w)
  return (
    <div className="mb-4 p-4 glass-surface-soft border border-[var(--glass-stroke-focus)]">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="font-bold text-[var(--glass-text-primary)] text-sm">{t('candidate.title')}</h4>
          <p className="text-xs text-[var(--glass-text-tertiary)]">{t('image.clickToPreview')}</p>
        </div>
        <button
          onClick={onCancel}
          disabled={isConfirming}
          className="text-[var(--glass-text-tertiary)] hover:text-[var(--glass-text-secondary)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <AppIcon name="close" className="w-5 h-5" />
        </button>
      </div>

      {/* 缩略图选择 - 横向排列 */}
      <div className="flex gap-3 flex-wrap">
        {/* 原图 */}
        <div className="flex flex-col items-center gap-1">
          <button
            onClick={() => {
              onSelect(0)
              if (originalImageUrl) onPreview(getImageUrl(originalImageUrl)!)
            }}
            className={`relative rounded-lg overflow-hidden border-3 transition-all hover:scale-105 ${selectedIndex === 0
              ? 'border-[var(--glass-stroke-focus)] ring-2 ring-[var(--glass-focus-ring)] shadow-lg'
              : 'border-[var(--glass-stroke-strong)] hover:border-[var(--glass-stroke-focus)]'
              }`}
            style={{ width: `${thumbWidth}px`, height: `${thumbHeight}px` }}
          >
            {originalImageUrl ? (
              <MediaImageWithLoading
                src={getImageUrl(originalImageUrl)!}
                alt={t('candidate.original')}
                containerClassName="w-full h-full"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-[var(--glass-bg-muted)] flex items-center justify-center text-[var(--glass-text-tertiary)] text-xs">
                {t('image.noValidCandidates')}
              </div>
            )}
            {selectedIndex === 0 && (
              <div className="absolute top-1 right-1 w-5 h-5 bg-[var(--glass-accent-from)] text-white rounded-full flex items-center justify-center shadow">
                <AppIcon name="checkSm" className="w-3 h-3" />
              </div>
            )}
            {/* 放大图标 */}
            <div className="absolute bottom-1 right-1 w-5 h-5 bg-[var(--glass-overlay)] text-white rounded flex items-center justify-center">
              <AppIcon name="searchPlus" className="w-3 h-3" />
            </div>
          </button>
          <span className="text-xs text-[var(--glass-text-secondary)]">{t('candidate.original')}</span>
        </div>

        {/* 候选图片 */}
        {candidates.map((url, index) => (
          <div key={index} className="flex flex-col items-center gap-1">
            <button
              onClick={() => {
                onSelect(index + 1)
                onPreview(getImageUrl(url)!)
              }}
              className={`relative rounded-lg overflow-hidden border-3 transition-all hover:scale-105 ${selectedIndex === index + 1
                ? 'border-[var(--glass-stroke-focus)] ring-2 ring-[var(--glass-focus-ring)] shadow-lg'
                : 'border-[var(--glass-stroke-strong)] hover:border-[var(--glass-stroke-focus)]'
                }`}
              style={{ width: `${thumbWidth}px`, height: `${thumbHeight}px` }}
            >
              <MediaImageWithLoading
                src={getImageUrl(url)!}
                alt={`${t('image.candidateCount', { count: index + 1 })}`}
                containerClassName="w-full h-full"
                className="w-full h-full object-cover"
              />
              {selectedIndex === index + 1 && (
                <div className="absolute top-1 right-1 w-5 h-5 bg-[var(--glass-accent-from)] text-white rounded-full flex items-center justify-center shadow">
                  <AppIcon name="checkSm" className="w-3 h-3" />
                </div>
              )}
              {/* 放大图标 */}
              <div className="absolute bottom-1 right-1 w-5 h-5 bg-[var(--glass-overlay)] text-white rounded flex items-center justify-center">
                <AppIcon name="searchPlus" className="w-3 h-3" />
              </div>
            </button>
            <span className="text-xs text-[var(--glass-text-secondary)]">{t('image.candidateCount', { count: index + 1 })}</span>
          </div>
        ))}
      </div>

      {/* 底部按钮 */}
      <div className="mt-4 flex justify-between items-center">
        <span className="text-sm text-[var(--glass-text-secondary)] font-medium">
          {t('image.confirmCandidate')}: <span className="text-[var(--glass-tone-info-fg)]">{selectedIndex === 0 ? t('candidate.original') : t('image.candidateCount', { count: selectedIndex })}</span>
        </span>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            disabled={isConfirming}
            className="px-4 py-2 text-sm text-[var(--glass-text-secondary)] bg-[var(--glass-bg-muted)] rounded-lg hover:bg-[var(--glass-bg-muted)] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t("candidate.cancel")}
          </button>
          <button
            onClick={() => {
              setIsConfirming(true)
              onConfirm()
            }}
            disabled={isConfirming}
            className="px-5 py-2 text-sm bg-[var(--glass-accent-from)] text-white rounded-lg hover:bg-[var(--glass-accent-to)] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-sm"
          >
            {isConfirming ? (
              <TaskStatusInline state={confirmingState} className="text-white [&>span]:text-white [&_svg]:text-white" />
            ) : (
              <>
                <AppIcon name="check" className="w-4 h-4" />
                {t('candidate.select')}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

