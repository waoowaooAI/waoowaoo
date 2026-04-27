'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import { GlassModalShell } from '@/components/ui/primitives'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { apiFetch } from '@/lib/api-fetch'
import { ART_STYLES, getArtStylePrompt } from '@/lib/constants'
import { STYLE_PRESETS } from '@/lib/style-presets'
import { buildDirectorStyleDoc, isDirectorStylePresetId } from '@/lib/director-style/presets'
import type {
  DirectorStyleConfig,
  PresetSource,
  StylePresetKind,
  StylePresetView,
  VisualStyleConfig,
} from '@/lib/style-preset/types'
import type { DirectorStyleDocField } from '@/lib/director-style/types'
import StylePresetEditor from './StylePresetEditor'
import {
  buildDraft,
  readDesignedPreset,
  readPresetList,
  type DraftState,
} from './stylePresetEditorState'

type PresetFilter = 'all' | StylePresetKind
type EditorMode = 'create' | 'edit-user' | 'view-system'

type StylePresetListItem = {
  source: PresetSource
  id: string
  kind: StylePresetKind
  name: string
  summary: string | null
  config: VisualStyleConfig | DirectorStyleConfig
}

function buildSystemVisualConfig(presetId: string, locale: string): VisualStyleConfig {
  return {
    prompt: getArtStylePrompt(presetId, locale === 'en' ? 'en' : 'zh'),
    negativePrompt: '',
    colorPalette: [],
    lineStyle: '',
    texture: '',
    lighting: '',
    composition: '',
    detailLevel: 'medium',
  }
}

function toPresetKey(preset: Pick<StylePresetListItem, 'source' | 'kind' | 'id'>): string {
  return `${preset.source}:${preset.kind}:${preset.id}`
}

export default function StylePresetsTab() {
  const t = useTranslations('profile.stylePresets')
  const tc = useTranslations('common')
  const locale = useLocale()
  const [activeKind, setActiveKind] = useState<PresetFilter>('all')
  const [presets, setPresets] = useState<StylePresetView[]>([])
  const [draft, setDraft] = useState<DraftState>(() => buildDraft('visual_style'))
  const [editorMode, setEditorMode] = useState<EditorMode>('create')
  const [activePresetKey, setActivePresetKey] = useState<string | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [designing, setDesigning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const systemPresets = useMemo<StylePresetListItem[]>(() => {
    const visualPresets = ART_STYLES.map((style) => ({
      source: 'system' as const,
      id: style.value,
      kind: 'visual_style' as const,
      name: style.label,
      summary: getArtStylePrompt(style.value, locale === 'en' ? 'en' : 'zh'),
      config: buildSystemVisualConfig(style.value, locale),
    }))
    const directorPresets = STYLE_PRESETS
      .filter((preset) => preset.value)
      .flatMap((preset) => {
        if (!isDirectorStylePresetId(preset.value)) return []
        return [{
          source: 'system' as const,
          id: preset.value,
          kind: 'director_style' as const,
          name: preset.label,
          summary: preset.description,
          config: buildDirectorStyleDoc(preset.value),
        }]
      })
    return [...visualPresets, ...directorPresets]
  }, [locale])

  const listItems = useMemo<StylePresetListItem[]>(() => [
    ...systemPresets,
    ...presets.map((preset) => ({
      source: 'user' as const,
      id: preset.id,
      kind: preset.kind,
      name: preset.name,
      summary: preset.summary,
      config: preset.config,
    })),
  ], [presets, systemPresets])

  const filteredPresets = useMemo(
    () => activeKind === 'all' ? listItems : listItems.filter((preset) => preset.kind === activeKind),
    [activeKind, listItems],
  )
  const filterOptions = useMemo(
    () => [
      { value: 'all' as const, label: t('filters.all') },
      { value: 'visual_style' as const, label: t('kind.visual_style') },
      { value: 'director_style' as const, label: t('kind.director_style') },
    ],
    [t],
  )

  const loadPresets = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await apiFetch('/api/user/style-presets')
      const data = await response.json().catch(() => null) as unknown
      if (!response.ok) throw new Error(t('loadFailed'))
      setPresets(readPresetList(data))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void loadPresets()
  }, [loadPresets])

  const switchKind = (kind: StylePresetKind) => {
    setDraft(buildDraft(kind))
    setError(null)
  }

  const createPreset = (kind: StylePresetKind = 'visual_style') => {
    setDraft(buildDraft(kind))
    setEditorMode('create')
    setActivePresetKey(null)
    setError(null)
    setEditorOpen(true)
  }

  const openPreset = (preset: StylePresetListItem) => {
    setDraft({
      id: preset.source === 'user' ? preset.id : null,
      kind: preset.kind,
      name: preset.name,
      summary: preset.summary ?? '',
      instruction: '',
      config: preset.config,
    })
    setEditorMode(preset.source === 'user' ? 'edit-user' : 'view-system')
    setActivePresetKey(toPresetKey(preset))
    setError(null)
    setEditorOpen(true)
  }

  const designPreset = async () => {
    if (!draft.instruction.trim() || designing) return
    setDesigning(true)
    setError(null)
    try {
      const response = await apiFetch('/api/user/style-presets/design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: draft.kind,
          instruction: draft.instruction,
          locale,
        }),
      })
      const data = await response.json().catch(() => null) as unknown
      if (!response.ok) throw new Error(t('designFailed'))
      const designed = readDesignedPreset(data)
      if (!designed) throw new Error(t('designFailed'))
      setDraft((current) => ({
        ...current,
        kind: designed.kind,
        name: designed.name,
        summary: designed.summary,
        config: designed.config,
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('designFailed'))
    } finally {
      setDesigning(false)
    }
  }

  const savePreset = async () => {
    if (!draft.name.trim() || saving) return
    setSaving(true)
    setError(null)
    try {
      const payload = {
        kind: draft.kind,
        name: draft.name,
        summary: draft.summary.trim() ? draft.summary : null,
        config: draft.config,
      }
      const body = draft.id
        ? {
            name: payload.name,
            summary: payload.summary,
            config: payload.config,
          }
        : payload
      const response = await apiFetch(draft.id ? `/api/user/style-presets/${draft.id}` : '/api/user/style-presets', {
        method: draft.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!response.ok) throw new Error(t('saveFailed'))
      await loadPresets()
      setEditorOpen(false)
      setEditorMode('create')
      setActivePresetKey(null)
      setDraft(buildDraft('visual_style'))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const archivePreset = async (presetId: string) => {
    setError(null)
    const response = await apiFetch(`/api/user/style-presets/${presetId}`, { method: 'DELETE' })
    if (!response.ok) {
      setError(t('archiveFailed'))
      return
    }
    await loadPresets()
    if (draft.id === presetId) {
      setEditorOpen(false)
      setEditorMode('create')
      setActivePresetKey(null)
      setDraft(buildDraft('visual_style'))
    }
  }

  const updateVisualConfig = (patch: Partial<VisualStyleConfig>) => {
    setDraft((current) => {
      if (current.kind !== 'visual_style') return current
      return {
        ...current,
        config: {
          ...(current.config as VisualStyleConfig),
          ...patch,
        },
      }
    })
  }

  const updateDirectorBlock = (
    field: DirectorStyleDocField,
    key: string,
    value: string,
  ) => {
    setDraft((current) => {
      if (current.kind !== 'director_style') return current
      const config = current.config as DirectorStyleConfig
      const block = config[field] as unknown as Record<string, string>
      return {
        ...current,
        config: {
          ...config,
          [field]: {
            ...block,
            [key]: value,
          },
        },
      }
    })
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-[var(--glass-stroke-base)] px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--glass-text-primary)]">{t('title')}</h2>
            <p className="mt-1 text-sm text-[var(--glass-text-tertiary)]">{t('subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SegmentedControl
            options={filterOptions}
            value={activeKind}
            onChange={setActiveKind}
            layout="compact"
            className="min-w-max"
          />
          <button
            type="button"
            onClick={() => createPreset(activeKind === 'director_style' ? 'director_style' : 'visual_style')}
            className="glass-btn-base glass-btn-primary flex items-center gap-2 px-3 py-1.5 text-sm font-semibold"
            aria-label={t('newPreset')}
            title={t('newPreset')}
          >
            <AppIcon name="plus" className="h-4 w-4" />
            {t('newPreset')}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-6 app-scrollbar">
        {error && !editorOpen ? (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        ) : null}
          <PresetList
          activePresetKey={activePresetKey}
          loading={loading}
          presets={filteredPresets}
          onOpen={openPreset}
          onCreate={createPreset}
        />
      </div>

      <GlassModalShell
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editorMode === 'view-system' ? t('systemTitle') : draft.id ? t('editTitle') : t('createTitle')}
        description={editorMode === 'view-system' ? t('systemDescription') : draft.id ? t('editDescription') : t('createDescription')}
        size="xl"
        footer={
          <div className="flex items-center justify-between gap-3">
            <div>
              {editorMode === 'edit-user' ? (
                <ArchiveAction presetId={draft.id} label={t('archive')} onArchive={archivePreset} />
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                className="glass-btn-base glass-btn-secondary px-4 py-2 text-sm"
              >
                {tc('cancel')}
              </button>
              {editorMode !== 'view-system' ? (
                <button
                  type="button"
                  onClick={() => void savePreset()}
                  disabled={!draft.name.trim() || saving}
                  className="glass-btn-base glass-btn-primary px-5 py-2 text-sm disabled:opacity-50"
                >
                  {saving ? t('saving') : t('save')}
                </button>
              ) : null}
            </div>
          </div>
        }
      >
        <StylePresetEditor
          draft={draft}
          error={error}
          designing={designing}
          readOnly={editorMode === 'view-system'}
          onKindChange={switchKind}
          onNameChange={(value) => setDraft((current) => ({ ...current, name: value }))}
          onSummaryChange={(value) => setDraft((current) => ({ ...current, summary: value }))}
          onInstructionChange={(value) => setDraft((current) => ({ ...current, instruction: value }))}
          onDesign={() => void designPreset()}
          onVisualConfigChange={updateVisualConfig}
          onDirectorBlockChange={updateDirectorBlock}
        />
      </GlassModalShell>
    </div>
  )
}

function ArchiveAction({
  presetId,
  label,
  onArchive,
}: {
  presetId: string | null
  label: string
  onArchive: (presetId: string) => Promise<void>
}) {
  if (!presetId) return null
  return (
    <button
      type="button"
      onClick={() => void onArchive(presetId)}
      className="glass-btn-base glass-btn-tone-danger px-4 py-2 text-sm"
    >
      {label}
    </button>
  )
}

function PresetList({
  activePresetKey,
  loading,
  presets,
  onOpen,
  onCreate,
}: {
  activePresetKey: string | null
  loading: boolean
  presets: StylePresetListItem[]
  onOpen: (preset: StylePresetListItem) => void
  onCreate: (kind?: StylePresetKind) => void
}) {
  const t = useTranslations('profile.stylePresets')

  return (
    <div>
      {loading ? (
        <div className="flex h-48 items-center justify-center text-sm text-[var(--glass-text-tertiary)]">{t('loading')}</div>
      ) : presets.length === 0 ? (
        <div className="glass-surface flex min-h-[240px] flex-col items-center justify-center rounded-2xl p-8 text-center">
          <span className="glass-surface-soft mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl text-[var(--glass-text-secondary)]">
            <AppIcon name="sparkles" className="h-6 w-6" />
          </span>
          <p className="text-sm font-semibold text-[var(--glass-text-primary)]">{t('empty')}</p>
          <p className="mt-1 max-w-sm text-xs leading-relaxed text-[var(--glass-text-tertiary)]">{t('emptyDescription')}</p>
          <button
            type="button"
            onClick={() => onCreate()}
            className="glass-btn-base glass-btn-primary mt-4 flex items-center gap-2 px-3 py-2 text-sm"
          >
            <AppIcon name="plus" className="h-4 w-4" />
            {t('newPreset')}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => onOpen(preset)}
              className={`glass-surface group w-full rounded-2xl p-4 text-left transition-all hover:-translate-y-0.5 hover:border-[var(--glass-stroke-strong)] ${
                activePresetKey === toPresetKey(preset)
                  ? 'border-[var(--glass-accent-from)]'
                  : ''
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="glass-surface-soft inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--glass-text-secondary)]">
                      <AppIcon name={preset.kind === 'visual_style' ? 'image' : 'video'} className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-[var(--glass-text-primary)]">{preset.name}</div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] font-medium text-[var(--glass-text-tertiary)]">
                        <span>{t(`kind.${preset.kind}`)}</span>
                        <span className="glass-chip glass-chip-neutral px-1.5 py-0.5 text-[10px]">
                          {preset.source === 'system' ? t('source.system') : t('source.user')}
                        </span>
                      </div>
                    </div>
                  </div>
                  <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-[var(--glass-text-secondary)]">
                    {preset.summary ?? t('noSummary')}
                  </p>
                </div>
                <span className="glass-btn-base glass-btn-soft inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--glass-text-tertiary)] transition-colors group-hover:text-[var(--glass-text-primary)]">
                  <AppIcon name="edit" className="h-4 w-4" />
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
