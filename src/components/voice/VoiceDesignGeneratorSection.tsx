'use client'

import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { AppIcon } from '@/components/ui/icons'
import type { TaskPresentationState } from '@/lib/task/presentation'
import {
  MAX_VOICE_SCHEME_COUNT,
  MIN_VOICE_SCHEME_COUNT,
  normalizeVoiceSchemeCount,
  type GeneratedVoice,
} from './voice-design-shared'

const VOICE_PRESET_KEYS = [
  'maleBroadcaster',
  'gentleFemale',
  'matureMale',
  'livelyFemale',
  'intellectualFemale',
  'narrator',
] as const

type VoicePresetKey = (typeof VOICE_PRESET_KEYS)[number]

interface VoiceDesignGeneratorSectionProps {
  voicePrompt: string
  onVoicePromptChange: (value: string) => void
  previewText: string
  onPreviewTextChange: (value: string) => void
  schemeCount: string
  onSchemeCountChange: (value: string) => void
  isSubmitting: boolean
  submittingState: TaskPresentationState | null
  error: string | null
  generatedVoices: GeneratedVoice[]
  selectedIndex: number | null
  onSelectIndex: (index: number) => void
  playingIndex: number | null
  onPlayVoice: (index: number) => void
  onGenerate: () => void
  footer?: ReactNode
}

export default function VoiceDesignGeneratorSection({
  voicePrompt,
  onVoicePromptChange,
  previewText,
  onPreviewTextChange,
  schemeCount,
  onSchemeCountChange,
  isSubmitting,
  submittingState,
  error,
  generatedVoices,
  selectedIndex,
  onSelectIndex,
  playingIndex,
  onPlayVoice,
  onGenerate,
  footer = null,
}: VoiceDesignGeneratorSectionProps) {
  const tv = useTranslations('voice.voiceDesign')
  const normalizedSchemeCount = normalizeVoiceSchemeCount(schemeCount)

  return (
    <>
      <div>
        <div className="text-sm text-[var(--glass-text-secondary)] mb-2">{tv('selectStyle')}</div>
        <div className="flex flex-wrap gap-1.5">
          {VOICE_PRESET_KEYS.map((presetKey) => {
            const prompt = tv(`presetsPrompts.${presetKey}` as `presetsPrompts.${VoicePresetKey}`)
            return (
              <button
                key={presetKey}
                onClick={() => onVoicePromptChange(prompt)}
                className={`glass-btn-base px-2.5 py-1 text-xs rounded-md border transition-all ${
                  voicePrompt === prompt
                    ? 'glass-btn-tone-info border-[var(--glass-stroke-focus)]'
                    : 'glass-btn-soft text-[var(--glass-text-secondary)] border-[var(--glass-stroke-base)] hover:border-[var(--glass-stroke-focus)]'
                }`}
              >
                {tv(`presets.${presetKey}` as `presets.${VoicePresetKey}`)}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <div className="text-sm text-[var(--glass-text-secondary)] mb-1">{tv('orCustomDescription')}</div>
        <textarea
          value={voicePrompt}
          onChange={(event) => onVoicePromptChange(event.target.value)}
          placeholder={tv('describePlaceholder')}
          className="glass-textarea-base w-full px-3 py-2 text-sm resize-none"
          rows={2}
        />
      </div>

      <details className="text-sm">
        <summary className="text-[var(--glass-text-secondary)] cursor-pointer hover:text-[var(--glass-text-primary)]">
          {tv('editPreviewText')}
        </summary>
        <input
          type="text"
          value={previewText}
          onChange={(event) => onPreviewTextChange(event.target.value)}
          placeholder={tv('defaultPreviewText')}
          className="glass-input-base w-full mt-2 px-3 py-2 text-sm"
        />
      </details>

      {generatedVoices.length === 0 && !isSubmitting && (
        <div
          role="button"
          tabIndex={!voicePrompt.trim() ? -1 : 0}
          aria-disabled={!voicePrompt.trim()}
          onClick={() => {
            if (!voicePrompt.trim()) return
            onGenerate()
          }}
          onKeyDown={(event) => {
            if (!voicePrompt.trim()) return
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onGenerate()
            }
          }}
          className={`glass-btn-base glass-btn-primary w-full py-2.5 rounded-lg text-sm font-medium transition-opacity ${
            !voicePrompt.trim() ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <span>{tv('generateSchemesPrefix')}</span>
            <div
              className="group relative inline-flex items-center rounded-md px-1.5 py-0.5 transition-colors hover:bg-white/12 focus-within:bg-white/14"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            >
              <select
                value={String(normalizedSchemeCount)}
                onChange={(event) => onSchemeCountChange(event.target.value)}
                aria-label={tv('schemeCountAriaLabel')}
                className="appearance-none bg-transparent border-0 pl-0 pr-3 text-sm font-semibold text-white/96 outline-none cursor-pointer leading-none transition-colors group-hover:text-white focus:text-white"
              >
                {Array.from({ length: MAX_VOICE_SCHEME_COUNT - MIN_VOICE_SCHEME_COUNT + 1 }, (_, index) => {
                  const value = String(index + MIN_VOICE_SCHEME_COUNT)
                  return (
                    <option key={value} value={value} className="text-black">
                      {value}
                    </option>
                  )
                })}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-1 flex items-center text-white/82 transition-colors group-hover:text-white group-focus-within:text-white">
                <AppIcon name="chevronDown" className="h-3 w-3" />
              </div>
            </div>
            <span>{tv('generateSchemesSuffix')}</span>
          </div>
        </div>
      )}

      {isSubmitting && submittingState && (
        <div className="py-6">
          <TaskStatusInline
            state={submittingState}
            className="justify-center text-[var(--glass-text-secondary)] [&>span]:text-[var(--glass-text-secondary)]"
          />
        </div>
      )}

      {generatedVoices.length > 0 && (
        <div className="space-y-3">
          <div className="text-sm text-[var(--glass-text-secondary)]">{tv('selectScheme')}</div>
          <div className="grid grid-cols-3 gap-2">
            {generatedVoices.map((voice, index) => (
              <div
                key={voice.voiceId}
                onClick={() => onSelectIndex(index)}
                className={`relative p-3 rounded-lg border-2 cursor-pointer transition-all text-center ${
                  selectedIndex === index
                    ? 'border-[var(--glass-stroke-focus)] bg-[var(--glass-tone-info-bg)]'
                    : 'border-[var(--glass-stroke-base)] hover:border-[var(--glass-stroke-focus)]'
                }`}
              >
                {selectedIndex === index && (
                  <div className="absolute -top-1.5 -right-1.5 w-5 h-5 glass-chip glass-chip-info rounded-full flex items-center justify-center p-0">
                    <AppIcon name="checkSolid" className="w-3 h-3 text-white" />
                  </div>
                )}
                <div className="text-sm font-medium text-[var(--glass-text-primary)] mb-2">{tv('schemeN', { n: index + 1 })}</div>
                <button
                  onClick={(event) => {
                    event.stopPropagation()
                    onPlayVoice(index)
                  }}
                  className={`w-10 h-10 mx-auto rounded-full glass-btn-base flex items-center justify-center transition-all ${
                    playingIndex === index
                      ? 'glass-btn-tone-info animate-pulse'
                      : 'glass-btn-secondary text-[var(--glass-text-secondary)]'
                  }`}
                >
                  {playingIndex === index ? (
                    <AppIcon name="pause" className="w-4 h-4" />
                  ) : (
                    <AppIcon name="play" className="w-5 h-5" />
                  )}
                </button>
              </div>
            ))}
          </div>
          {footer}
        </div>
      )}

      {error && (
        <div className="text-sm text-[var(--glass-tone-danger-fg)] bg-[var(--glass-tone-danger-bg)] px-3 py-2 rounded-lg">
          {error}
        </div>
      )}
    </>
  )
}
