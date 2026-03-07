'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { USER_FEEDBACK_FORM_URL } from '@/lib/feedback'
import { buildFeedbackLog, type FeedbackContextStage } from '@/lib/feedback-log'

export type LLMStageViewStatus =
  | 'pending'
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'stale'

export type LLMStageViewItem = {
  id: string
  title: string
  subtitle?: string
  status: LLMStageViewStatus
  progress?: number
  attempt?: number
  retryable?: boolean
}

export type LLMStageStreamCardProps = {
  title: string
  subtitle?: string
  stages: LLMStageViewItem[]
  activeStageId: string
  selectedStageId?: string
  onSelectStage?: (stageId: string) => void
  onRetryStage?: (stageId: string) => void
  outputText: string
  placeholderText?: string
  activeMessage?: string
  overallProgress?: number
  showCursor?: boolean
  autoScroll?: boolean
  smoothStreaming?: boolean
  errorMessage?: string
  topRightAction?: ReactNode
  feedbackStage?: FeedbackContextStage
  projectId?: string
  episodeId?: string | null
}

const PROGRESS_KEY_PREFIX = 'progress.'
const REASONING_HEADER = '【思考过程】'
const FINAL_HEADER = '【最终结果】'

function statusClass(status: LLMStageViewStatus): string {
  if (status === 'completed') return 'glass-chip glass-chip-success'
  if (status === 'stale') return 'glass-chip glass-chip-warning'
  if (status === 'blocked') return 'glass-chip glass-chip-warning'
  if (status === 'failed') return 'glass-chip glass-chip-danger'
  if (status === 'processing') return 'glass-chip glass-chip-info'
  if (status === 'queued') return 'glass-chip glass-chip-warning'
  return 'glass-chip glass-chip-neutral'
}

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value))
}

function splitThinkTaggedContent(input: string): { text: string; reasoning: string } {
  const thinkTagPattern = /<(think|thinking)\b[^>]*>([\s\S]*?)<\/\1>/gi
  const reasoningParts: string[] = []
  let hadTag = false

  let stripped = input.replace(thinkTagPattern, (_fullMatch, _tagName: string, inner: string) => {
    hadTag = true
    const trimmed = inner.trim()
    if (trimmed) reasoningParts.push(trimmed)
    return ''
  })

  const openTagMatch = stripped.match(/<(think|thinking)\b[^>]*>/i)
  if (openTagMatch && typeof openTagMatch.index === 'number') {
    hadTag = true
    const start = openTagMatch.index
    const openTag = openTagMatch[0]
    const tail = stripped
      .slice(start + openTag.length)
      .replace(/<\/(think|thinking)\s*>/gi, '')
      .trim()
    if (tail) reasoningParts.push(tail)
    stripped = stripped.slice(0, start)
  }

  if (!hadTag) {
    return {
      text: input,
      reasoning: '',
    }
  }

  return {
    text: stripped.trim(),
    reasoning: reasoningParts.join('\n\n').trim(),
  }
}

function mergeReasoning(base: string, incoming: string): string {
  const next = incoming.trim()
  if (!next) return base
  const prev = base.trim()
  if (!prev) return next
  if (next.startsWith(prev)) return next
  if (prev.includes(next)) return base
  return `${prev}\n\n${next}`
}

export function splitStructuredOutput(raw: string): {
  hasStructured: boolean
  showReasoning: boolean
  showFinal: boolean
  reasoning: string
  finalText: string
} {
  const normalized = typeof raw === 'string' ? raw : ''
  if (!normalized.startsWith(REASONING_HEADER) && !normalized.startsWith(FINAL_HEADER)) {
    return {
      hasStructured: false,
      showReasoning: false,
      showFinal: false,
      reasoning: '',
      finalText: '',
    }
  }

  const finalIndex = normalized.indexOf(FINAL_HEADER)
  if (normalized.startsWith(REASONING_HEADER) && finalIndex >= 0) {
    const reasoningRaw = normalized
      .slice(REASONING_HEADER.length, finalIndex)
      .trim()
    const finalRaw = normalized
      .slice(finalIndex + FINAL_HEADER.length)
      .trim()
    const parsedFinal = splitThinkTaggedContent(finalRaw)
    return {
      hasStructured: true,
      showReasoning: true,
      showFinal: true,
      reasoning: mergeReasoning(reasoningRaw, parsedFinal.reasoning),
      finalText: parsedFinal.text,
    }
  }

  if (normalized.startsWith(REASONING_HEADER)) {
    return {
      hasStructured: true,
      showReasoning: true,
      showFinal: true,
      reasoning: normalized.slice(REASONING_HEADER.length).trim(),
      finalText: '',
    }
  }

  const finalRaw = normalized.slice(FINAL_HEADER.length).trim()
  const parsedFinal = splitThinkTaggedContent(finalRaw)
  return {
    hasStructured: true,
    showReasoning: true,
    showFinal: true,
    reasoning: parsedFinal.reasoning,
    finalText: parsedFinal.text,
  }
}

export default function LLMStageStreamCard({
  title,
  subtitle,
  stages,
  activeStageId,
  selectedStageId,
  onSelectStage,
  onRetryStage,
  outputText,
  placeholderText,
  activeMessage,
  overallProgress,
  showCursor = false,
  autoScroll = true,
  smoothStreaming = true,
  errorMessage,
  topRightAction,
  feedbackStage,
  projectId,
  episodeId,
}: LLMStageStreamCardProps) {
  const t = useTranslations('progress')
  const locale = useLocale()
  const feedbackLocale: 'zh' | 'en' = locale === 'en' ? 'en' : 'zh'

  const resolveProgressText = useCallback((value: string | undefined, fallbackKey: string): string => {
    const raw = typeof value === 'string' ? value.trim() : ''
    if (!raw) return t(fallbackKey as never)
    if (!raw.startsWith(PROGRESS_KEY_PREFIX)) return raw
    const key = raw.slice(PROGRESS_KEY_PREFIX.length)
    try {
      return t(key as never)
    } catch {
      return raw
    }
  }, [t])

  const statusLabel = useCallback((status: LLMStageViewStatus): string => {
    if (status === 'completed') return t('status.completed')
    if (status === 'stale') return 'Stale'
    if (status === 'blocked') return 'Blocked'
    if (status === 'failed') return t('status.failed')
    if (status === 'processing') return t('status.processing')
    if (status === 'queued') return t('status.queued')
    return t('status.pending')
  }, [t])

  const resolvedPlaceholderText = resolveProgressText(placeholderText, 'stageCard.waitingModelOutput')

  const outputStageId = selectedStageId || activeStageId
  const outputRef = useRef<HTMLDivElement | null>(null)
  const renderFrameRef = useRef<number | null>(null)
  const renderTargetRef = useRef(outputText)
  const renderCurrentRef = useRef(outputText)
  const latestOutputRef = useRef(outputText)
  const [renderedOutputText, setRenderedOutputText] = useState(outputText)
  const activeIndex = Math.max(
    0,
    stages.findIndex((stage) => stage.id === activeStageId),
  )
  const activeStage = stages[activeIndex] || stages[0]
  const outputStage = stages.find((stage) => stage.id === outputStageId) || activeStage
  const stageCount = stages.length
  const completedCount = stages.filter((stage) => stage.status === 'completed' || stage.status === 'stale').length
  const hasPendingWork = stages.some((stage) =>
    stage.status === 'processing' ||
    stage.status === 'queued' ||
    stage.status === 'pending' ||
    stage.status === 'blocked',
  )
  const currentStep = stageCount === 0
    ? 0
    : hasPendingWork
      ? Math.min(stageCount, Math.max(1, completedCount))
      : stageCount
  const normalizedOverallProgress =
    typeof overallProgress === 'number'
      ? clampProgress(overallProgress)
      : clampProgress(
        stageCount === 0
          ? 0
          : ((stages.filter((item) => item.status === 'completed').length +
            (activeStage?.status === 'processing' ? (activeStage.progress || 0) / 100 : 0)) /
            stageCount) *
          100,
      )
  const structuredOutput = splitStructuredOutput(renderedOutputText)

  const stopRenderLoop = useCallback(() => {
    if (renderFrameRef.current == null) return
    cancelAnimationFrame(renderFrameRef.current)
    renderFrameRef.current = null
  }, [])

  const renderNextFrame = useCallback(() => {
    const current = renderCurrentRef.current
    const target = renderTargetRef.current
    if (current === target) {
      renderFrameRef.current = null
      return
    }

    if (!target.startsWith(current)) {
      renderCurrentRef.current = target
      setRenderedOutputText(target)
      renderFrameRef.current = null
      return
    }

    const remaining = target.length - current.length
    const frameStep =
      remaining > 1200
        ? 18
        : remaining > 700
          ? 12
          : remaining > 300
            ? 8
            : remaining > 120
              ? 5
              : 2
    const next = target.slice(0, current.length + frameStep)
    renderCurrentRef.current = next
    setRenderedOutputText(next)
    renderFrameRef.current = requestAnimationFrame(renderNextFrame)
  }, [])

  useEffect(() => {
    latestOutputRef.current = outputText
    renderTargetRef.current = outputText
    const shouldSmooth = smoothStreaming && showCursor && outputStageId === activeStageId
    if (!shouldSmooth) {
      stopRenderLoop()
      if (renderCurrentRef.current !== outputText) {
        renderCurrentRef.current = outputText
        setRenderedOutputText(outputText)
      }
      return
    }

    if (
      outputText.length < renderCurrentRef.current.length ||
      !outputText.startsWith(renderCurrentRef.current)
    ) {
      stopRenderLoop()
      renderCurrentRef.current = outputText
      setRenderedOutputText(outputText)
      return
    }

    if (outputText.length === renderCurrentRef.current.length) return
    if (renderFrameRef.current != null) return
    renderFrameRef.current = requestAnimationFrame(renderNextFrame)
  }, [
    outputText,
    showCursor,
    outputStageId,
    activeStageId,
    smoothStreaming,
    renderNextFrame,
    stopRenderLoop,
  ])

  useEffect(() => {
    stopRenderLoop()
    const output = latestOutputRef.current
    renderTargetRef.current = output
    renderCurrentRef.current = output
    setRenderedOutputText(output)
  }, [outputStageId, stopRenderLoop])

  useEffect(() => {
    if (!activeStage || !autoScroll || !outputRef.current) return
    const node = outputRef.current
    node.scrollTop = node.scrollHeight
  }, [activeStage, renderedOutputText, showCursor, autoScroll])

  useEffect(() => {
    return () => {
      stopRenderLoop()
    }
  }, [stopRenderLoop])

  if (!activeStage) return null

  return (
    <article className="glass-surface-modal flex h-full w-full flex-col overflow-hidden rounded-2xl text-[var(--glass-text-primary)]">
      <header className="border-b border-[var(--glass-stroke-base)] px-5 py-5 md:px-6">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[15rem_minmax(0,1fr)_auto] md:items-center">
          <div className="glass-surface-soft rounded-xl border border-[var(--glass-stroke-base)] p-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--glass-text-tertiary)]">
              {t('stageCard.stage')}
            </p>
            <p className="mt-1 text-2xl font-semibold text-[var(--glass-text-primary)]">
              {currentStep}/{stageCount}
            </p>
            <p className="mt-1 truncate text-sm text-[var(--glass-text-secondary)]">
              {resolveProgressText(activeStage.title, 'stageCard.currentStage')}
            </p>
          </div>

          <div className="min-w-0 text-center">
            <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--glass-text-tertiary)]">
              {resolveProgressText(subtitle, 'stageCard.realtimeStream')}
            </p>
            <h2 className="mt-1 text-xl font-semibold text-[var(--glass-text-primary)] md:text-2xl">
              {resolveProgressText(title, 'stageCard.currentStage')}
            </h2>
            <p className="mt-2 truncate text-sm text-[var(--glass-text-secondary)]">
              {resolveProgressText(activeMessage || activeStage.subtitle, 'runtime.llm.processing')}
            </p>
          </div>

          <div className="flex shrink-0 items-center justify-start whitespace-nowrap md:justify-end">{topRightAction || null}</div>
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--glass-bg-muted)]">
          <div
            className="h-full rounded-full bg-[linear-gradient(120deg,var(--glass-accent-from),var(--glass-accent-to))] transition-[width] duration-200"
            style={{ width: `${Math.max(normalizedOverallProgress, 2)}%` }}
          />
        </div>

        {errorMessage && (
          <div className="mt-3 flex flex-col gap-2 rounded-lg bg-[var(--glass-tone-danger-bg)] px-4 py-2.5 text-[var(--glass-tone-danger-fg)]">
            <div className="flex items-center gap-2">
              <span className="text-base">⚠️</span>
              <span className="text-sm font-medium">{errorMessage}</span>
            </div>
            {feedbackStage && projectId && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--glass-text-secondary)]">
                <button
                  type="button"
                  onClick={() => {
                    const log = buildFeedbackLog({
                      locale: feedbackLocale,
                      projectId,
                      episodeId: episodeId ?? undefined,
                      stage: feedbackStage,
                      errorMessage,
                    })
                    void navigator.clipboard.writeText(log)
                  }}
                  className="glass-btn-base glass-btn-secondary rounded-md px-2 py-1 text-[11px]"
                >
                  {t('runConsole.copyErrorDetail')}
                </button>
                <a
                  href={USER_FEEDBACK_FORM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="glass-btn-base glass-btn-primary rounded-md px-2 py-1 text-[11px]"
                >
                  {t('runConsole.openFeedbackForm')}
                </a>
              </div>
            )}
          </div>
        )}
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-5 md:grid-cols-[17rem_1fr] md:gap-5 md:p-6">
        <aside className="glass-surface-soft min-h-0 rounded-xl border border-[var(--glass-stroke-base)] p-3">
          <ul className="max-h-[40vh] space-y-2 overflow-y-auto pr-1 md:h-full md:max-h-none">
            {stages.map((stage, index) => {
              const isActive = stage.id === outputStageId
              const progress = clampProgress(stage.progress || 0)
              const attempt =
                typeof stage.attempt === 'number' && Number.isFinite(stage.attempt)
                  ? Math.max(1, Math.floor(stage.attempt))
                  : 1
              const showRetryButton =
                stage.status === 'failed'
                && stage.retryable !== false
                && typeof onRetryStage === 'function'
              return (
                <li key={stage.id}>
                  <div
                    className={`rounded-lg border p-2.5 ${isActive
                      ? 'border-[var(--glass-stroke-focus)] bg-[var(--glass-tone-info-bg)]'
                      : 'border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)]'
                      }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectStage?.(stage.id)}
                      className={`w-full text-left ${onSelectStage ? 'cursor-pointer' : 'cursor-default'}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="glass-chip glass-chip-neutral min-w-6 justify-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold leading-none">
                            {index + 1}
                          </span>
                          {attempt > 1 && (
                            <span className="glass-chip glass-chip-warning min-w-6 justify-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold leading-none">
                              ×{attempt}
                            </span>
                          )}
                          <p className="truncate text-sm font-medium text-[var(--glass-text-primary)]">
                            {resolveProgressText(stage.title, 'stageCard.currentStage')}
                          </p>
                        </div>
                        <span className={statusClass(stage.status)}>{statusLabel(stage.status)}</span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--glass-bg-muted)]">
                        <div
                          className="h-full rounded-full bg-[var(--glass-accent-from)] transition-[width] duration-200"
                          style={{ width: `${Math.max(progress, stage.status === 'completed' ? 100 : 2)}%` }}
                        />
                      </div>
                    </button>
                    {showRetryButton && (
                      <div className="mt-2 flex justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            void onRetryStage(stage.id)
                          }}
                          className="glass-btn-base glass-btn-primary rounded-md px-2.5 py-1 text-[11px]"
                        >
                          重试
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </aside>

        <section className="glass-surface-soft min-h-[320px] rounded-xl border border-[var(--glass-stroke-base)]">
          <div className="border-b border-[var(--glass-stroke-base)] px-4 py-3 text-sm font-medium text-[var(--glass-text-primary)]">
            {t('stageCard.outputTitle', {
              stage: resolveProgressText(outputStage?.title, 'stageCard.currentStage'),
            })}
          </div>
          <div
            ref={outputRef}
            className="h-[52vh] overflow-y-auto px-4 py-4"
          >
            {structuredOutput.hasStructured ? (
              <div className="space-y-4">
                {structuredOutput.showReasoning ? (
                  <div className="rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)]">
                    <div className="border-b border-[var(--glass-stroke-base)] px-3 py-2 text-xs font-semibold text-[var(--glass-text-primary)]">
                      {REASONING_HEADER}
                    </div>
                    <pre className="min-h-[110px] whitespace-pre-wrap break-words px-3 py-3 font-mono text-[14px] leading-7 text-[var(--glass-text-secondary)]">
                      {structuredOutput.reasoning || (structuredOutput.finalText ? t('stageCard.reasoningNotProvided') : t('stageCard.waitingModelOutput'))}
                      {showCursor && !structuredOutput.finalText ? <span className="animate-pulse text-[var(--glass-accent-from)]">▋</span> : null}
                    </pre>
                  </div>
                ) : null}
                {structuredOutput.showFinal ? (
                  <div className="rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)]">
                    <div className="border-b border-[var(--glass-stroke-base)] px-3 py-2 text-xs font-semibold text-[var(--glass-text-primary)]">
                      {FINAL_HEADER}
                    </div>
                    <pre className="min-h-[110px] whitespace-pre-wrap break-words px-3 py-3 font-mono text-[14px] leading-7 text-[var(--glass-text-secondary)]">
                      {structuredOutput.finalText || t('stageCard.waitingModelOutput')}
                      {showCursor && !!structuredOutput.finalText ? <span className="animate-pulse text-[var(--glass-accent-from)]">▋</span> : null}
                    </pre>
                  </div>
                ) : null}
              </div>
            ) : (
              <pre className="whitespace-pre-wrap break-words font-mono text-[14px] leading-7 text-[var(--glass-text-secondary)]">
                {renderedOutputText || resolvedPlaceholderText}
                {showCursor ? <span className="animate-pulse text-[var(--glass-accent-from)]">▋</span> : null}
              </pre>
            )}
          </div>
        </section>
      </div>
    </article>
  )
}
