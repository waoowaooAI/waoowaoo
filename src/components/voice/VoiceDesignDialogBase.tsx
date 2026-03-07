'use client'

import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import { AppIcon } from '@/components/ui/icons'
import VoiceDesignGeneratorSection from './VoiceDesignGeneratorSection'
import {
  DEFAULT_VOICE_SCHEME_COUNT,
  generateVoiceDesignOptions,
  type GeneratedVoice,
  type VoiceDesignMutationPayload,
  type VoiceDesignMutationResult,
} from './voice-design-shared'

export type { VoiceDesignMutationPayload, VoiceDesignMutationResult } from './voice-design-shared'

interface VoiceDesignDialogBaseProps {
  isOpen: boolean
  speaker: string
  hasExistingVoice?: boolean
  onClose: () => void
  onSave: (voiceId: string, audioBase64: string) => void
  onDesignVoice: (payload: VoiceDesignMutationPayload) => Promise<VoiceDesignMutationResult>
}

export default function VoiceDesignDialogBase({
  isOpen,
  speaker,
  hasExistingVoice = false,
  onClose,
  onSave,
  onDesignVoice,
}: VoiceDesignDialogBaseProps) {
  const t = useTranslations('common')
  const tv = useTranslations('voice.voiceDesign')

  const [voicePrompt, setVoicePrompt] = useState('')
  const [previewText, setPreviewText] = useState(tv('defaultPreviewText'))
  const [schemeCount, setSchemeCount] = useState(String(DEFAULT_VOICE_SCHEME_COUNT))
  const [isDesignSubmitting, setIsDesignSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generatedVoices, setGeneratedVoices] = useState<GeneratedVoice[]>([])
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [playingIndex, setPlayingIndex] = useState<number | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const designSubmittingState = isDesignSubmitting
    ? resolveTaskPresentationState({
        phase: 'processing',
        intent: 'generate',
        resource: 'audio',
        hasOutput: false,
      })
    : null

  const handleGenerate = async () => {
    if (!voicePrompt.trim()) {
      setError(tv('pleaseSelectStyle'))
      return
    }

    setIsDesignSubmitting(true)
    setError(null)
    setGeneratedVoices([])
    setSelectedIndex(null)

    try {
      const voices = await generateVoiceDesignOptions({
        count: schemeCount,
        voicePrompt,
        previewText,
        defaultPreviewText: tv('defaultPreviewText'),
        onDesignVoice,
      })
      setGeneratedVoices(voices)
    } catch (err: unknown) {
      const status = err instanceof Error ? (err as Error & { status?: number }).status : undefined
      if (status === 402) {
        const detail = err instanceof Error ? (err as Error & { detail?: string }).detail : undefined
        alert(t('insufficientBalance') + '\n\n' + (detail || t('insufficientBalanceDetail')))
        setError('INSUFFICIENT_BALANCE')
        return
      }

      const message = err instanceof Error ? err.message : tv('generationError')
      setError(message === 'VOICE_DESIGN_EMPTY_RESULT' ? tv('noVoiceGenerated') : (message || tv('generationError')))
    } finally {
      setIsDesignSubmitting(false)
    }
  }

  const handlePlayVoice = (index: number) => {
    if (playingIndex === index && audioRef.current) {
      audioRef.current.pause()
      setPlayingIndex(null)
      return
    }

    if (audioRef.current) {
      audioRef.current.pause()
    }

    setPlayingIndex(index)
    const audio = new Audio(generatedVoices[index].audioUrl)
    audioRef.current = audio
    audio.onended = () => setPlayingIndex(null)
    audio.onerror = () => setPlayingIndex(null)
    void audio.play()
  }

  const handleConfirmSelection = () => {
    if (selectedIndex !== null && generatedVoices[selectedIndex]) {
      if (hasExistingVoice) {
        setShowConfirmDialog(true)
      } else {
        doSave()
      }
    }
  }

  const doSave = () => {
    if (selectedIndex !== null && generatedVoices[selectedIndex]) {
      const voice = generatedVoices[selectedIndex]
      onSave(voice.voiceId, voice.audioBase64)
      handleClose()
    }
  }

  const handleClose = () => {
    setVoicePrompt('')
    setPreviewText(tv('defaultPreviewText'))
    setSchemeCount(String(DEFAULT_VOICE_SCHEME_COUNT))
    setError(null)
    setGeneratedVoices([])
    setSelectedIndex(null)
    setShowConfirmDialog(false)
    setPlayingIndex(null)
    if (audioRef.current) {
      audioRef.current.pause()
    }
    onClose()
  }

  if (!isOpen) return null
  if (typeof document === 'undefined') return null

  const dialogContent = (
    <>
      <div className="fixed inset-0 z-[9999] glass-overlay" onClick={handleClose} />
      <div
        className="fixed z-[10000] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 glass-surface-modal w-full max-w-xl overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface-strong)]">
          <div className="flex items-center gap-2">
            <AppIcon name="mic" className="w-5 h-5 text-[var(--glass-tone-info-fg)]" />
            <h2 className="font-semibold text-[var(--glass-text-primary)]">{tv('designVoiceFor', { speaker })}</h2>
            {hasExistingVoice && (
              <span className="glass-chip glass-chip-warning text-xs px-1.5 py-0.5">{tv('hasExistingVoice')}</span>
            )}
          </div>
          <button onClick={handleClose} className="glass-btn-base glass-btn-soft p-1 text-[var(--glass-text-tertiary)]">
            <AppIcon name="close" className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <VoiceDesignGeneratorSection
            voicePrompt={voicePrompt}
            onVoicePromptChange={setVoicePrompt}
            previewText={previewText}
            onPreviewTextChange={setPreviewText}
            schemeCount={schemeCount}
            onSchemeCountChange={setSchemeCount}
            isSubmitting={isDesignSubmitting}
            submittingState={designSubmittingState}
            error={error}
            generatedVoices={generatedVoices}
            selectedIndex={selectedIndex}
            onSelectIndex={setSelectedIndex}
            playingIndex={playingIndex}
            onPlayVoice={handlePlayVoice}
            onGenerate={() => {
              void handleGenerate()
            }}
            footer={(
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => {
                    void handleGenerate()
                  }}
                  disabled={isDesignSubmitting}
                  className="glass-btn-base glass-btn-secondary flex-1 py-2 rounded-lg text-sm"
                >
                  {tv('regenerate')}
                </button>
                <button
                  onClick={handleConfirmSelection}
                  disabled={selectedIndex === null}
                  className="glass-btn-base glass-btn-tone-success flex-1 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                >
                  {tv('confirmUse')}
                </button>
              </div>
            )}
          />
        </div>
      </div>

      {showConfirmDialog && (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4 glass-overlay">
          <div className="glass-surface-modal w-full max-w-sm p-5 text-center">
            <div className="w-12 h-12 mx-auto glass-chip glass-chip-warning rounded-full flex items-center justify-center mb-3 p-0">
              <AppIcon name="alert" className="w-6 h-6 text-[var(--glass-tone-warning-fg)]" />
            </div>
            <h3 className="font-semibold text-[var(--glass-text-primary)] mb-1">{tv('confirmReplace')}</h3>
            <p className="text-sm text-[var(--glass-text-secondary)] mb-4">
              {tv('replaceWarning')}
              <span className="font-medium text-[var(--glass-text-primary)]">「{speaker}」</span>
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowConfirmDialog(false)}
                className="glass-btn-base glass-btn-secondary flex-1 py-2 rounded-lg text-sm"
              >
                {t('cancel')}
              </button>
              <button
                onClick={doSave}
                className="glass-btn-base glass-btn-danger flex-1 py-2 rounded-lg text-sm"
              >
                {tv('confirmReplaceBtn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )

  return createPortal(dialogContent, document.body)
}
