'use client'

import { useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import type {
  DirectorAgentState,
  AgentPhase,
  AgentToolLogEntry,
} from '../hooks/useDirectorAgent'

// =====================================================
// Phase display helpers
// =====================================================

const PHASE_ICONS: Record<AgentPhase, string> = {
  planning: '📋',
  analyzing: '🔍',
  scripting: '📝',
  storyboarding: '🎬',
  generating_assets: '🎨',
  generating_video: '🎥',
  generating_voice: '🎙️',
  reviewing: '✅',
  revising: '🔧',
  completed: '🏁',
  failed: '❌',
}

const TOOL_ICONS: Record<string, string> = {
  analyze_novel: '🔍',
  create_script: '📝',
  create_storyboard: '🎬',
  generate_character_image: '👤',
  generate_location_image: '🏞️',
  generate_panel_image: '🖼️',
  generate_video: '🎥',
  generate_voice: '🎙️',
  review_quality: '✅',
  revise_panel: '🔧',
  get_project_status: '📊',
}

// =====================================================
// Sub-components
// =====================================================

function PhaseIndicator({
  phase,
  t,
}: {
  phase: AgentPhase | null
  t: ReturnType<typeof useTranslations<'directorAgent'>>
}) {
  if (!phase) return null

  return (
    <div className="flex items-center gap-2">
      <span className="text-lg">{PHASE_ICONS[phase] || '⏳'}</span>
      <span className="text-sm font-medium text-[var(--glass-text-primary)]">
        {t(`phases.${phase}` as never)}
      </span>
    </div>
  )
}

function ThinkingStream({
  text,
  isRunning,
  t,
}: {
  text: string
  isRunning: boolean
  t: ReturnType<typeof useTranslations<'directorAgent'>>
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [text])

  return (
    <div className="flex flex-1 flex-col rounded-xl border border-[var(--glass-stroke-base)] glass-surface-soft">
      <div className="border-b border-[var(--glass-stroke-base)] px-4 py-2.5 text-sm font-medium text-[var(--glass-text-primary)]">
        {t('panel.thinking')}
      </div>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-3"
      >
        <pre className="whitespace-pre-wrap break-words font-mono text-[13px] leading-6 text-[var(--glass-text-secondary)]">
          {text || t('panel.waitingThinking')}
          {isRunning && (
            <span className="animate-pulse text-[var(--glass-accent-from)]">▋</span>
          )}
        </pre>
      </div>
    </div>
  )
}

function ToolLog({
  entries,
  t,
}: {
  entries: AgentToolLogEntry[]
  t: ReturnType<typeof useTranslations<'directorAgent'>>
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [entries.length])

  return (
    <div className="flex w-full flex-col rounded-xl border border-[var(--glass-stroke-base)] glass-surface-soft md:w-72">
      <div className="border-b border-[var(--glass-stroke-base)] px-4 py-2.5 text-sm font-medium text-[var(--glass-text-primary)]">
        {t('panel.toolLog')} ({entries.length})
      </div>
      <div
        ref={scrollRef}
        className="max-h-[40vh] flex-1 overflow-y-auto md:max-h-none"
      >
        {entries.length === 0 ? (
          <p className="px-4 py-3 text-xs text-[var(--glass-text-tertiary)]">
            {t('panel.noToolCalls')}
          </p>
        ) : (
          <ul className="divide-y divide-[var(--glass-stroke-base)]">
            {entries.map((entry) => (
              <li key={entry.id} className="px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm">{TOOL_ICONS[entry.name] || '🔧'}</span>
                  <span className="flex-1 truncate text-xs font-medium text-[var(--glass-text-primary)]">
                    {entry.name}
                  </span>
                  <ToolStatusBadge status={entry.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function ToolStatusBadge({ status }: { status: AgentToolLogEntry['status'] }) {
  if (status === 'calling') {
    return (
      <span className="glass-chip glass-chip-info text-[10px]">
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
      </span>
    )
  }
  if (status === 'success') {
    return <span className="glass-chip glass-chip-success text-[10px]">OK</span>
  }
  return <span className="glass-chip glass-chip-danger text-[10px]">ERR</span>
}

// =====================================================
// Main Panel Component
// =====================================================

interface DirectorAgentPanelProps {
  state: DirectorAgentState & {
    isRunning: boolean
    isVisible: boolean
  }
  minimized: boolean
  onMinimize: () => void
  onMaximize: () => void
  onStop: () => void
  onReset: () => void
}

export default function DirectorAgentPanel({
  state,
  minimized,
  onMinimize,
  onMaximize,
  onStop,
  onReset,
}: DirectorAgentPanelProps) {
  const t = useTranslations('directorAgent')

  if (!state.isVisible) return null

  // Minimized pill
  if (minimized) {
    return (
      <button
        type="button"
        onClick={onMaximize}
        className="fixed right-6 bottom-6 z-[130] glass-surface-modal rounded-2xl px-4 py-3 text-sm font-medium text-[var(--glass-tone-info-fg)] shadow-lg"
      >
        {state.isRunning ? t('pill.running') : state.status === 'completed' ? t('pill.completed') : t('pill.failed')}
        {state.isRunning && (
          <span className="ml-2 inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--glass-accent-from)]" />
        )}
      </button>
    )
  }

  // Full panel overlay
  return (
    <div className="fixed inset-0 z-[130] glass-overlay backdrop-blur-sm">
      <div className="mx-auto mt-4 flex h-[calc(100vh-2rem)] w-[min(96vw,1400px)] flex-col">
        <article className="glass-surface-modal flex h-full flex-col overflow-hidden rounded-2xl text-[var(--glass-text-primary)]">
          {/* Header */}
          <header className="border-b border-[var(--glass-stroke-base)] px-5 py-4 md:px-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <h2 className="text-xl font-semibold text-[var(--glass-text-primary)]">
                  {t('panel.title')}
                </h2>
                <PhaseIndicator phase={state.phase} t={t} />
              </div>
              <div className="flex items-center gap-2">
                {state.isRunning && (
                  <button
                    type="button"
                    onClick={onStop}
                    className="glass-btn-base glass-btn-secondary rounded-lg px-3 py-1.5 text-xs"
                  >
                    {t('panel.stop')}
                  </button>
                )}
                {!state.isRunning && state.status !== 'idle' && (
                  <button
                    type="button"
                    onClick={onReset}
                    className="glass-btn-base glass-btn-secondary rounded-lg px-3 py-1.5 text-xs"
                  >
                    {t('panel.close')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={onMinimize}
                  className="glass-btn-base glass-btn-secondary rounded-lg px-3 py-1.5 text-xs"
                >
                  {t('panel.minimize')}
                </button>
              </div>
            </div>

            {/* Progress info */}
            <div className="mt-3 flex items-center gap-4 text-xs text-[var(--glass-text-tertiary)]">
              <span>{t('panel.iteration', { count: String(state.iterationCount) })}</span>
              {state.runId && (
                <span className="truncate">Run: {state.runId.slice(0, 20)}...</span>
              )}
            </div>

            {/* Error display */}
            {state.error && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-[var(--glass-tone-danger-bg)] px-4 py-2.5 text-[var(--glass-tone-danger-fg)]">
                <span className="text-sm font-medium">{state.error}</span>
              </div>
            )}
          </header>

          {/* Body: thinking stream + tool log */}
          <div className="flex min-h-0 flex-1 flex-col gap-4 p-5 md:flex-row md:p-6">
            <ThinkingStream
              text={state.thinkingText}
              isRunning={state.isRunning}
              t={t}
            />
            <ToolLog entries={state.toolLog} t={t} />
          </div>
        </article>
      </div>
    </div>
  )
}
