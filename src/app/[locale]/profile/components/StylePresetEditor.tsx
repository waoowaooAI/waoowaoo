'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import type { DirectorStyleConfig, VisualStyleConfig } from '@/lib/style-preset/types'
import { normalizePromptOnlyVisualStyleConfig } from '@/lib/style-preset/visual-config'
import type { DraftState } from './stylePresetEditorState'

type StylePresetEditorProps = {
  draft: DraftState
  error: string | null
  designing: boolean
  readOnly: boolean
  onKindChange: (kind: DraftState['kind']) => void
  onNameChange: (value: string) => void
  onInstructionChange: (value: string) => void
  onDesign: () => void
  onVisualConfigChange: (patch: Partial<VisualStyleConfig>) => void
}

export default function StylePresetEditor({
  draft,
  error,
  designing,
  readOnly,
  onKindChange,
  onNameChange,
  onInstructionChange,
  onDesign,
  onVisualConfigChange,
}: StylePresetEditorProps) {
  const t = useTranslations('profile.stylePresets')
  const visualConfig = draft.kind === 'visual_style' ? draft.config as VisualStyleConfig : null
  const directorConfig = draft.kind === 'director_style' ? draft.config as DirectorStyleConfig : null
  const showEditableName = !readOnly
  const kindOptions = [
    {
      value: 'visual_style' as const,
      label: (
        <>
          <AppIcon name="image" className="h-4 w-4" />
          <span>{t('kind.visual_style')}</span>
        </>
      ),
    },
    {
      value: 'director_style' as const,
      label: (
        <>
          <AppIcon name="video" className="h-4 w-4" />
          <span>{t('kind.director_style')}</span>
        </>
      ),
    },
  ]

  return (
    <div className="max-h-[64vh] overflow-y-auto pr-1 app-scrollbar">
      {error ? (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4">
        {!draft.id && !readOnly ? (
          <div className="space-y-2">
            <SegmentedControl
              options={kindOptions}
              value={draft.kind}
              onChange={onKindChange}
            />
            <p className="text-xs leading-relaxed text-[var(--glass-text-tertiary)]">
              {t(`kindDescription.${draft.kind}`)}
            </p>
          </div>
        ) : null}

        {showEditableName ? (
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-[var(--glass-text-secondary)]">{t('fields.name')}</span>
            <input
              value={draft.name}
              onChange={(event) => onNameChange(event.target.value)}
              className="glass-input-base h-10 px-3 text-sm text-[var(--glass-text-primary)]"
            />
          </label>
        ) : null}

        {visualConfig ? (
          <VisualStyleForm config={visualConfig} readOnly={readOnly} onChange={onVisualConfigChange} />
        ) : null}

        {directorConfig ? (
          <DirectorStyleForm
            config={directorConfig}
            instruction={draft.instruction}
            designing={designing}
            readOnly={readOnly}
            onInstructionChange={onInstructionChange}
            onDesign={onDesign}
          />
        ) : null}
      </div>
    </div>
  )
}

function VisualStyleForm({
  config,
  readOnly,
  onChange,
}: {
  config: VisualStyleConfig
  readOnly: boolean
  onChange: (patch: Partial<VisualStyleConfig>) => void
}) {
  const t = useTranslations('profile.stylePresets')
  const visibleConfig = normalizePromptOnlyVisualStyleConfig(config)

  return (
    <div className="grid gap-2">
      <ConfigTextarea
        label={t('fields.prompt')}
        value={visibleConfig.prompt}
        readOnly={readOnly}
        onChange={(value) => onChange({ prompt: value })}
        rows={4}
      />
    </div>
  )
}

function ConfigTextarea({
  label,
  value,
  readOnly,
  onChange,
  rows = 3,
}: {
  label: string
  value: string
  readOnly: boolean
  rows?: number
  onChange: (value: string) => void
}) {
  if (readOnly) {
    return (
      <div className="rounded-2xl bg-[var(--glass-bg-base)] px-4 py-3 text-sm shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
        <span className="mb-2 block font-semibold text-[var(--glass-text-primary)]">{label}</span>
        <p className="min-h-5 whitespace-pre-wrap break-words leading-relaxed text-[var(--glass-text-secondary)]">
          {value || '—'}
        </p>
      </div>
    )
  }

  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium text-[var(--glass-text-secondary)]">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        className="glass-input-base w-full resize-none px-3 py-2 text-sm leading-relaxed text-[var(--glass-text-primary)] app-scrollbar"
      />
    </label>
  )
}

function DirectorStyleForm({
  config,
  instruction,
  designing,
  readOnly,
  onInstructionChange,
  onDesign,
}: {
  config: DirectorStyleConfig
  instruction: string
  designing: boolean
  readOnly: boolean
  onInstructionChange: (value: string) => void
  onDesign: () => void
}) {
  const t = useTranslations('profile.stylePresets')
  const [expanded, setExpanded] = useState(false)
  const jsonValue = JSON.stringify(config, null, 2)

  if (readOnly) {
    return (
      <div className="rounded-2xl bg-[var(--glass-bg-base)] px-4 py-3 text-sm shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
        <button
          type="button"
          onClick={() => setExpanded(value => !value)}
          className="flex w-full items-center justify-between text-left"
        >
          <span className="font-semibold text-[var(--glass-text-primary)]">{t('directorConfigDetails')}</span>
          <AppIcon name="chevronDown" className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
        {expanded ? (
          <pre className="mt-3 max-h-80 overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-white/60 p-3 text-xs leading-relaxed text-[var(--glass-text-secondary)] app-scrollbar">
            {jsonValue}
          </pre>
        ) : null}
      </div>
    )
  }

  return (
    <div className="grid gap-3">
      <label className="grid gap-1.5">
        <span className="font-medium text-[var(--glass-text-secondary)]">{t('fields.instruction')}</span>
        <textarea
          value={instruction}
          onChange={(event) => onInstructionChange(event.target.value)}
          rows={4}
          className="glass-input-base resize-none px-3 py-2 text-sm leading-relaxed text-[var(--glass-text-primary)] app-scrollbar"
        />
      </label>
      <button
        type="button"
        onClick={onDesign}
        disabled={!instruction.trim() || designing}
        className="glass-btn-base glass-btn-primary h-10 w-fit px-4 text-sm disabled:opacity-50"
      >
        <AppIcon name="sparkles" className="h-4 w-4" />
        {designing ? t('designing') : t('design')}
      </button>
      <div className="rounded-xl bg-[var(--glass-bg-base)] px-3 py-2">
        <button
          type="button"
          onClick={() => setExpanded(value => !value)}
          className="flex w-full items-center justify-between text-left text-xs font-semibold text-[var(--glass-text-secondary)]"
        >
          <span>{t('directorConfigDetails')}</span>
          <AppIcon name="chevronDown" className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
        {expanded ? (
          <pre className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-[var(--glass-text-secondary)] app-scrollbar">
            {jsonValue}
          </pre>
        ) : null}
      </div>
    </div>
  )
}
