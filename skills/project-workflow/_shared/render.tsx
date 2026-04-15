import type { ReactNode } from 'react'

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export function SkillResultCard(props: {
  title: string
  subtitle: string
  data: unknown
  footer?: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)]/70 p-3">
      <div className="text-sm font-medium text-[var(--glass-text-primary)]">{props.title}</div>
      <div className="mt-1 text-xs text-[var(--glass-text-secondary)]">{props.subtitle}</div>
      <pre className="mt-3 max-h-52 overflow-auto rounded-xl bg-[var(--glass-bg-surface)]/70 p-3 text-xs leading-relaxed text-[var(--glass-text-primary)]">
        {formatJson(props.data)}
      </pre>
      {props.footer ? <div className="mt-3 text-xs text-[var(--glass-text-tertiary)]">{props.footer}</div> : null}
    </div>
  )
}

export function WorkflowResultCard(props: {
  title: string
  summary: string
  skills: string[]
  data: unknown
}) {
  return (
    <div className="rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)]/70 p-3">
      <div className="text-sm font-medium text-[var(--glass-text-primary)]">{props.title}</div>
      <div className="mt-1 text-xs text-[var(--glass-text-secondary)]">{props.summary}</div>
      <div className="mt-2 text-[11px] text-[var(--glass-text-tertiary)]">{props.skills.join(' -> ')}</div>
      <pre className="mt-3 max-h-56 overflow-auto rounded-xl bg-[var(--glass-bg-surface)]/70 p-3 text-xs leading-relaxed text-[var(--glass-text-primary)]">
        {formatJson(props.data)}
      </pre>
    </div>
  )
}
