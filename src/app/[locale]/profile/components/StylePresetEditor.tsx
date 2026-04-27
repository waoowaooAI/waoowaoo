'use client'

import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import type { DirectorStyleConfig, VisualStyleConfig } from '@/lib/style-preset/types'
import {
  DIRECTOR_STYLE_BLOCK_FIELD_KEYS,
  DIRECTOR_STYLE_DOC_FIELDS,
  type DirectorStyleDocField,
} from '@/lib/director-style/types'
import type { DraftState } from './stylePresetEditorState'

type StylePresetEditorProps = {
  draft: DraftState
  error: string | null
  designing: boolean
  readOnly: boolean
  onKindChange: (kind: DraftState['kind']) => void
  onNameChange: (value: string) => void
  onSummaryChange: (value: string) => void
  onInstructionChange: (value: string) => void
  onDesign: () => void
  onVisualConfigChange: (patch: Partial<VisualStyleConfig>) => void
  onDirectorBlockChange: (field: DirectorStyleDocField, key: string, value: string) => void
}

export default function StylePresetEditor({
  draft,
  error,
  designing,
  readOnly,
  onKindChange,
  onNameChange,
  onSummaryChange,
  onInstructionChange,
  onDesign,
  onVisualConfigChange,
  onDirectorBlockChange,
}: StylePresetEditorProps) {
  const t = useTranslations('profile.stylePresets')
  const visualConfig = draft.kind === 'visual_style' ? draft.config as VisualStyleConfig : null
  const directorConfig = draft.kind === 'director_style' ? draft.config as DirectorStyleConfig : null

  return (
    <div className="max-h-[68vh] overflow-y-auto pr-1 app-scrollbar">
      {error ? (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      <div className="grid gap-5">
        {!draft.id && !readOnly ? (
          <div className="grid grid-cols-2 gap-2">
            {(['visual_style', 'director_style'] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => onKindChange(kind)}
                className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                  draft.kind === kind
                    ? 'border-[var(--glass-accent-from)] bg-[var(--glass-accent-from)]/10'
                    : 'border-[var(--glass-stroke-base)] hover:bg-[var(--glass-bg-muted)]'
                }`}
              >
                <span className="text-sm font-semibold text-[var(--glass-text-primary)]">{t(`kind.${kind}`)}</span>
                <span className="mt-1 block text-xs text-[var(--glass-text-tertiary)]">{t(`kindDescription.${kind}`)}</span>
              </button>
            ))}
          </div>
        ) : null}

        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-[var(--glass-text-secondary)]">{t('fields.name')}</span>
          <input
            value={draft.name}
            onChange={(event) => onNameChange(event.target.value)}
            readOnly={readOnly}
            className="glass-input-base h-10 px-3 text-[var(--glass-text-primary)]"
          />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-[var(--glass-text-secondary)]">{t('fields.summary')}</span>
          <textarea
            value={draft.summary}
            onChange={(event) => onSummaryChange(event.target.value)}
            readOnly={readOnly}
            rows={2}
            className="glass-input-base resize-none px-3 py-2 text-[var(--glass-text-primary)] app-scrollbar"
          />
        </label>
        {!readOnly ? (
          <div className="grid gap-2">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-[var(--glass-text-secondary)]">{t('fields.instruction')}</span>
            <textarea
              value={draft.instruction}
              onChange={(event) => onInstructionChange(event.target.value)}
              rows={3}
              className="glass-input-base resize-none px-3 py-2 text-[var(--glass-text-primary)] app-scrollbar"
            />
          </label>
          <button
            type="button"
            onClick={onDesign}
            disabled={!draft.instruction.trim() || designing}
            className="glass-btn-base glass-btn-primary h-10 w-fit px-4 text-sm disabled:opacity-50"
          >
            <AppIcon name="sparkles" className="h-4 w-4" />
            {designing ? t('designing') : t('design')}
          </button>
          </div>
        ) : null}

        {visualConfig ? (
          <VisualStyleForm config={visualConfig} readOnly={readOnly} onChange={onVisualConfigChange} />
        ) : null}

        {directorConfig ? (
          <DirectorStyleForm config={directorConfig} readOnly={readOnly} onChange={onDirectorBlockChange} />
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

  return (
    <div className="grid gap-3">
      <ConfigTextarea label={t('fields.prompt')} value={config.prompt} readOnly={readOnly} onChange={(value) => onChange({ prompt: value })} />
      <ConfigTextarea label={t('fields.negativePrompt')} value={config.negativePrompt} readOnly={readOnly} onChange={(value) => onChange({ negativePrompt: value })} />
      <ConfigTextarea label={t('fields.colorPalette')} value={config.colorPalette.join(', ')} readOnly={readOnly} onChange={(value) => onChange({ colorPalette: value.split(',').map((item) => item.trim()).filter(Boolean) })} rows={2} />
      <ConfigTextarea label={t('fields.lineStyle')} value={config.lineStyle} readOnly={readOnly} onChange={(value) => onChange({ lineStyle: value })} rows={2} />
      <ConfigTextarea label={t('fields.texture')} value={config.texture} readOnly={readOnly} onChange={(value) => onChange({ texture: value })} rows={2} />
      <ConfigTextarea label={t('fields.lighting')} value={config.lighting} readOnly={readOnly} onChange={(value) => onChange({ lighting: value })} rows={2} />
      <ConfigTextarea label={t('fields.composition')} value={config.composition} readOnly={readOnly} onChange={(value) => onChange({ composition: value })} rows={2} />
      <label className="grid gap-1.5 text-sm">
        <span className="font-medium text-[var(--glass-text-secondary)]">{t('fields.detailLevel')}</span>
        <select
          value={config.detailLevel}
          onChange={(event) => onChange({ detailLevel: event.target.value as VisualStyleConfig['detailLevel'] })}
          disabled={readOnly}
          className="glass-input-base h-10 px-3 text-[var(--glass-text-primary)]"
        >
          <option value="low">{t('detailLevels.low')}</option>
          <option value="medium">{t('detailLevels.medium')}</option>
          <option value="high">{t('detailLevels.high')}</option>
        </select>
      </label>
    </div>
  )
}

function DirectorStyleForm({
  config,
  readOnly,
  onChange,
}: {
  config: DirectorStyleConfig
  readOnly: boolean
  onChange: (field: DirectorStyleDocField, key: string, value: string) => void
}) {
  const t = useTranslations('profile.stylePresets')

  return (
    <div className="grid gap-4">
      {DIRECTOR_STYLE_DOC_FIELDS.map((field) => (
        <div key={field} className="rounded-xl border border-[var(--glass-stroke-soft)] p-4">
          <h3 className="mb-3 text-sm font-semibold text-[var(--glass-text-primary)]">{t(`directorFields.${field}`)}</h3>
          {DIRECTOR_STYLE_BLOCK_FIELD_KEYS[field].map((key) => (
            <ConfigTextarea
              key={key}
              label={t(`directorBlockFields.${field}.${key}`)}
              value={readDirectorBlockValue(config[field], key)}
              readOnly={readOnly}
              onChange={(value) => onChange(field, key, value)}
              rows={key === 'prompt' || key === 'negativePrompt' || key === 'imagePrompt' || key === 'avoid' ? 3 : 2}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function readDirectorBlockValue(block: unknown, key: string): string {
  if (!block || typeof block !== 'object') return ''
  const value = (block as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : ''
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
  return (
    <label className="mb-2 grid gap-1.5 text-sm">
      <span className="font-medium text-[var(--glass-text-secondary)]">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        readOnly={readOnly}
        rows={rows}
        className="glass-input-base resize-none px-3 py-2 text-[var(--glass-text-primary)] app-scrollbar"
      />
    </label>
  )
}
