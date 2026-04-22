'use client'

import { useCallback, useEffect, useRef, type CompositionEvent, type ReactNode } from 'react'
import { RatioSelector, StylePresetSelector, StyleSelector } from '@/components/selectors/RatioStyleSelectors'
import { resolveTextareaTargetHeight } from '@/lib/ui/textarea-height'

interface StoryInputComposerOption {
  value: string
  label: string
  recommended?: boolean
}

interface StoryInputComposerStylePresetOption {
  value: string
  label: string
  description: string
}

interface StoryInputComposerProps {
  value: string
  onValueChange: (value: string) => void
  placeholder: string
  minRows: number
  disabled?: boolean
  maxHeightViewportRatio?: number
  topRight?: ReactNode
  footer?: ReactNode
  secondaryActions?: ReactNode
  primaryAction: ReactNode
  videoRatio: string
  onVideoRatioChange: (value: string) => void
  ratioOptions: StoryInputComposerOption[]
  getRatioUsage?: (ratio: string) => string
  artStyle: string
  onArtStyleChange: (value: string) => void
  styleOptions: StoryInputComposerOption[]
  stylePresetValue: string
  onStylePresetChange: (value: string) => void
  stylePresetOptions: readonly StoryInputComposerStylePresetOption[]
  onCompositionStart?: () => void
  onCompositionEnd?: (event: CompositionEvent<HTMLTextAreaElement>) => void
  textareaClassName?: string
}

export default function StoryInputComposer({
  value,
  onValueChange,
  placeholder,
  minRows,
  disabled = false,
  maxHeightViewportRatio = 0.5,
  topRight,
  footer,
  secondaryActions,
  primaryAction,
  videoRatio,
  onVideoRatioChange,
  ratioOptions,
  getRatioUsage,
  artStyle,
  onArtStyleChange,
  styleOptions,
  stylePresetValue,
  onStylePresetChange,
  stylePresetOptions,
  onCompositionStart,
  onCompositionEnd,
  textareaClassName,
}: StoryInputComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const textareaMinHeightRef = useRef<number | null>(null)

  const autoResizeTextarea = useCallback(() => {
    const el = textareaRef.current
    if (!el || typeof window === 'undefined') return

    const maxHeight = window.innerHeight * maxHeightViewportRatio
    const oldHeight = el.offsetHeight
    const oldScrollTop = el.scrollTop

    if (textareaMinHeightRef.current === null && oldHeight > 0) {
      textareaMinHeightRef.current = oldHeight
    }

    const minHeight = textareaMinHeightRef.current ?? oldHeight

    el.style.transition = 'none'
    el.style.height = 'auto'
    const scrollHeight = el.scrollHeight
    const targetHeight = resolveTextareaTargetHeight({
      minHeight,
      maxHeight,
      scrollHeight,
    })
    el.style.height = `${oldHeight}px`
    el.scrollTop = oldScrollTop

    requestAnimationFrame(() => {
      el.scrollTop = oldScrollTop
      el.style.transition = 'height 200ms ease-out'
      el.style.height = `${targetHeight}px`
      el.style.overflowY = scrollHeight > maxHeight ? 'auto' : 'hidden'
    })
  }, [maxHeightViewportRatio])

  useEffect(() => {
    autoResizeTextarea()
  }, [value, autoResizeTextarea])

  return (
    <div className="relative w-full glass-surface-elevated rounded-2xl">
      <div className="p-6 pb-4">
        {topRight && (
          <div className="mb-3 flex items-center justify-end">
            {topRight}
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          onCompositionStart={onCompositionStart}
          onCompositionEnd={onCompositionEnd}
          placeholder={placeholder}
          rows={minRows}
          disabled={disabled}
          className={`w-full resize-none border-none bg-transparent text-base text-[var(--glass-text-primary)] outline-none placeholder:text-[var(--glass-text-tertiary)] app-scrollbar ${textareaClassName ?? 'p-5 pb-3'}`}
        />
      </div>

      <div className="flex items-center gap-2 overflow-x-auto px-5 pb-4">
        <div className="flex min-w-max flex-1 items-center gap-2">
          <div className="w-[118px] flex-shrink-0">
            <RatioSelector
              value={videoRatio}
              onChange={onVideoRatioChange}
              options={ratioOptions}
              getUsage={getRatioUsage}
            />
          </div>
          <div className="w-[132px] flex-shrink-0">
            <StyleSelector
              value={artStyle}
              onChange={onArtStyleChange}
              options={styleOptions}
            />
          </div>
          {stylePresetOptions.length > 0 ? (
            <div className="w-[152px] flex-shrink-0">
              <StylePresetSelector
                value={stylePresetValue}
                onChange={onStylePresetChange}
                options={stylePresetOptions}
              />
            </div>
          ) : null}
        </div>
        <div className="ml-auto flex min-w-max items-center gap-2">
          {secondaryActions}
          {primaryAction}
        </div>
      </div>

      {footer && (
        <div className="px-6 pb-4">
          {footer}
        </div>
      )}
    </div>
  )
}
