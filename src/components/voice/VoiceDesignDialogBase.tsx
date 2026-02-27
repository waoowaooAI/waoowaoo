'use client'

import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import { AppIcon } from '@/components/ui/icons'

const VOICE_PRESET_KEYS = [
  'maleBroadcaster',
  'gentleFemale',
  'matureMale',
  'livelyFemale',
  'intellectualFemale',
  'narrator',
] as const

type VoicePresetKey = (typeof VOICE_PRESET_KEYS)[number]

export type VoiceDesignMutationPayload = {
  voicePrompt: string
  previewText: string
  preferredName: string
  language: 'zh'
}

export type VoiceDesignMutationResult = {
  voiceId?: string
  audioBase64?: string
  detail?: string
}

type GeneratedVoice = {
  voiceId: string
  audioBase64: string
  audioUrl: string
}

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
      const voices: GeneratedVoice[] = []
      for (let i = 0; i < 3; i += 1) {
        const safeName = `voice_${Date.now().toString(36)}_${i + 1}`.slice(0, 16)
        const data = await onDesignVoice({
          voicePrompt: voicePrompt.trim(),
          previewText: previewText.trim(),
          preferredName: safeName,
          language: 'zh',
        })

        if (data.audioBase64) {
          if (typeof data.voiceId !== 'string' || data.voiceId.length === 0) {
            throw new Error('VOICE_DESIGN_INVALID_RESPONSE: missing voiceId')
          }
          voices.push({
            voiceId: data.voiceId,
            audioBase64: data.audioBase64,
            audioUrl: `data:audio/wav;base64,${data.audioBase64}`,
          })
        }
      }

      if (voices.length === 0) {
        throw new Error(tv('noVoiceGenerated'))
      }

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
      setError(message || tv('generationError'))
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
          <div>
            <div className="text-sm text-[var(--glass-text-secondary)] mb-2">{tv('selectStyle')}</div>
            <div className="flex flex-wrap gap-1.5">
              {VOICE_PRESET_KEYS.map((presetKey, index) => {
                const prompt = tv(`presetsPrompts.${presetKey}` as `presetsPrompts.${VoicePresetKey}`)
                return (
                  <button
                    key={index}
                    onClick={() => setVoicePrompt(prompt)}
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
              onChange={(event) => setVoicePrompt(event.target.value)}
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
              onChange={(event) => setPreviewText(event.target.value)}
              className="glass-input-base w-full mt-2 px-3 py-2 text-sm"
            />
          </details>

          {error && (
            <div className="text-sm text-[var(--glass-tone-danger-fg)] bg-[var(--glass-tone-danger-bg)] px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          {generatedVoices.length === 0 && !isDesignSubmitting && (
            <button
              onClick={handleGenerate}
              disabled={!voicePrompt.trim()}
              className="glass-btn-base glass-btn-primary w-full py-2.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
            >
              {tv('generate3Schemes')}
            </button>
          )}

          {isDesignSubmitting && (
            <div className="py-6">
              <TaskStatusInline
                state={designSubmittingState}
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
                    onClick={() => setSelectedIndex(index)}
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
                        handlePlayVoice(index)
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

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleGenerate}
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
            </div>
          )}
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
