'use client'

import React, { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import {
  useCopyProjectPanel,
  useCreateProjectPanelVariant,
  useDeleteProjectPanel,
  useDownloadProjectImages,
  useDownloadRemoteBlob,
  useInsertProjectPanel,
  useListProjectEpisodeVideoUrls,
  useModifyProjectStoryboardImage,
  useProjectAssets,
  useRefreshEpisodeData,
  useRefreshProjectAssets,
  useRefreshStoryboards,
  useRegenerateProjectPanelImage,
  useUpdateProjectClip,
  useUpdateProjectPanel,
  useUpdateProjectPanelLink,
} from '@/lib/query/hooks'
import { useSelectProjectPanelCandidate } from '@/lib/query/mutations/storyboard-prompt-mutations'
import { useWorkspaceProvider } from '../../WorkspaceProvider'
import { useWorkspaceStageRuntime } from '../../WorkspaceStageRuntimeContext'
import type { ProjectClip, ProjectPanel, ProjectStoryboard } from '@/types/project'
import type { WorkspaceCanvasFlowNode } from '../node-canvas-types'

interface PanelContext {
  readonly storyboard: ProjectStoryboard
  readonly panel: ProjectPanel
}

interface CanvasObjectDetailLayerProps {
  readonly selectedNode: WorkspaceCanvasFlowNode | null
  readonly clips: readonly ProjectClip[]
  readonly storyboards: readonly ProjectStoryboard[]
  readonly onClose: () => void
}

type DetailTone = 'script' | 'shot' | 'image' | 'video' | 'final' | 'story'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseVideoGenerationOptions(value: string): {
  readonly options: Record<string, string | number | boolean>
  readonly error: boolean
} {
  if (!value.trim()) return { options: {}, error: false }
  try {
    const parsed = JSON.parse(value) as unknown
    if (!isRecord(parsed)) return { options: {}, error: true }
    const output: Record<string, string | number | boolean> = {}
    Object.entries(parsed).forEach(([key, itemValue]) => {
      if (typeof itemValue === 'string' || typeof itemValue === 'number' || typeof itemValue === 'boolean') {
        output[key] = itemValue
      }
    })
    return { options: output, error: false }
  } catch {
    return { options: {}, error: true }
  }
}

function parseCharacterRefs(value: string | null | undefined): Array<{ readonly name: string; readonly appearance: string }> {
  if (!value?.trim()) return []
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((item) => {
      if (typeof item === 'string' && item.trim()) return [{ name: item.trim(), appearance: '' }]
      if (!isRecord(item) || typeof item.name !== 'string') return []
      return [{
        name: item.name.trim(),
        appearance: typeof item.appearance === 'string' ? item.appearance.trim() : '',
      }]
    }).filter((item) => item.name)
  } catch {
    return value.split(',').map((name) => ({ name: name.trim(), appearance: '' })).filter((item) => item.name)
  }
}

function serializeCharacterRefs(value: readonly { readonly name: string; readonly appearance: string }[]): string {
  return JSON.stringify(value.map((item) => ({
    name: item.name,
    ...(item.appearance ? { appearance: item.appearance } : {}),
  })))
}

function splitUrls(value: string): string[] {
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  window.URL.revokeObjectURL(url)
  document.body.removeChild(anchor)
}

function resolveTone(kind: WorkspaceCanvasFlowNode['data']['kind']): DetailTone {
  switch (kind) {
    case 'scriptClip':
      return 'script'
    case 'shot':
      return 'shot'
    case 'imageAsset':
      return 'image'
    case 'videoClip':
      return 'video'
    case 'finalTimeline':
      return 'final'
    case 'storyInput':
    case 'analysis':
      return 'story'
  }
}

function toneClassName(tone: DetailTone): string {
  switch (tone) {
    case 'script':
      return 'border-[#7c3aed]/25'
    case 'shot':
      return 'border-[#059669]/25'
    case 'image':
      return 'border-[#d97706]/25'
    case 'video':
      return 'border-[#dc2626]/25'
    case 'final':
      return 'border-[#111827]/25'
    case 'story':
      return 'border-[#2f6fed]/25'
  }
}

function Field(props: {
  readonly label: string
  readonly children: ReactNode
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--glass-text-tertiary)]">{props.label}</span>
      {props.children}
    </label>
  )
}

function TextInput(props: {
  readonly value: string
  readonly onChange: (value: string) => void
  readonly placeholder?: string
}) {
  return (
    <input
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
      placeholder={props.placeholder}
      className="w-full rounded-md border border-[var(--glass-stroke-base)] bg-white px-3 py-2 text-sm text-[var(--glass-text-primary)] outline-none focus:border-[var(--glass-stroke-focus)]"
    />
  )
}

function TextArea(props: {
  readonly value: string
  readonly onChange: (value: string) => void
  readonly rows?: number
  readonly placeholder?: string
  readonly readOnly?: boolean
}) {
  return (
    <textarea
      value={props.value}
      rows={props.rows ?? 4}
      readOnly={props.readOnly}
      onChange={(event) => props.onChange(event.target.value)}
      placeholder={props.placeholder}
      className="w-full resize-y rounded-md border border-[var(--glass-stroke-base)] bg-white px-3 py-2 text-sm leading-6 text-[var(--glass-text-primary)] outline-none focus:border-[var(--glass-stroke-focus)]"
    />
  )
}

function isValidOptionalNumber(value: string): boolean {
  return !value.trim() || Number.isFinite(Number(value))
}

function DetailSection(props: {
  readonly title: string
  readonly children: ReactNode
}) {
  return (
    <section className="space-y-3 rounded-lg border border-black/5 bg-[#f8fafc] p-4">
      <h3 className="text-xs font-semibold uppercase tracking-[0.05em] text-[var(--glass-text-tertiary)]">{props.title}</h3>
      {props.children}
    </section>
  )
}

function ActionButton(props: {
  readonly children: ReactNode
  readonly onClick: () => void | Promise<void>
  readonly disabled?: boolean
  readonly variant?: 'primary' | 'danger' | 'ghost'
}) {
  const variant = props.variant ?? 'ghost'
  const className = variant === 'primary'
    ? 'bg-[#111827] text-white hover:bg-[#0f172a]'
    : variant === 'danger'
      ? 'border border-[var(--glass-stroke-danger)] bg-white text-[var(--glass-tone-danger-fg)] hover:bg-[var(--glass-tone-danger-bg)]'
      : 'border border-[var(--glass-stroke-base)] bg-white text-[var(--glass-text-secondary)] hover:bg-[#f8fafc]'
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={() => { void props.onClick() }}
      className={`inline-flex items-center justify-center rounded-md px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {props.children}
    </button>
  )
}

function findPanelContext(storyboards: readonly ProjectStoryboard[], panelId: string): PanelContext | null {
  for (const storyboard of storyboards) {
    const panel = (storyboard.panels ?? []).find((candidate) => candidate.id === panelId)
    if (panel) return { storyboard, panel }
  }
  return null
}

function candidateImages(panel: ProjectPanel): string[] {
  if (!panel.candidateImages) return []
  try {
    const parsed = JSON.parse(panel.candidateImages) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0 && !item.startsWith('PENDING:'))
  } catch {
    return []
  }
}

function ScriptClipDetail(props: {
  readonly clip: ProjectClip
  readonly node: WorkspaceCanvasFlowNode
  readonly onSave: (clipId: string, data: Record<string, unknown>) => Promise<void>
  readonly onGenerateStoryboard: () => Promise<void>
}) {
  const t = useTranslations('projectWorkflow.canvas.workspace.detail')
  const [summary, setSummary] = useState(props.clip.summary)
  const [content, setContent] = useState(props.clip.content)
  const [screenplay, setScreenplay] = useState(props.clip.screenplay ?? '')
  const [location, setLocation] = useState(props.clip.location ?? '')
  const [characters, setCharacters] = useState(props.clip.characters ?? '')
  const [propsText, setPropsText] = useState(props.clip.props ?? '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setSummary(props.clip.summary)
    setContent(props.clip.content)
    setScreenplay(props.clip.screenplay ?? '')
    setLocation(props.clip.location ?? '')
    setCharacters(props.clip.characters ?? '')
    setPropsText(props.clip.props ?? '')
  }, [props.clip])

  const save = async () => {
    setSaving(true)
    try {
      await props.onSave(props.clip.id, {
        summary,
        content,
        screenplay,
        location,
        characters,
        props: propsText,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <DetailSection title={t('sections.clipEdit')}>
        <Field label={t('fields.summary')}><TextInput value={summary} onChange={setSummary} /></Field>
        <Field label={t('fields.originalClip')}><TextArea value={content} onChange={setContent} rows={4} /></Field>
        <Field label={t('fields.screenplay')}><TextArea value={screenplay} onChange={setScreenplay} rows={8} /></Field>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label={t('fields.locations')}><TextArea value={location} onChange={setLocation} rows={3} /></Field>
          <Field label={t('fields.characters')}><TextArea value={characters} onChange={setCharacters} rows={3} /></Field>
          <Field label={t('fields.props')}><TextArea value={propsText} onChange={setPropsText} rows={3} /></Field>
        </div>
      </DetailSection>
      <div className="flex flex-wrap justify-end gap-2">
        <ActionButton onClick={save} disabled={saving} variant="primary">{saving ? t('actions.saving') : t('actions.saveClip')}</ActionButton>
        <ActionButton onClick={props.onGenerateStoryboard}>{t('actions.generateStoryboard')}</ActionButton>
      </div>
    </div>
  )
}

function ShotDetail(props: {
  readonly context: PanelContext
  readonly onSave: (context: PanelContext, data: Record<string, unknown>) => Promise<void>
  readonly onDelete: (context: PanelContext) => Promise<void>
  readonly onCopy: (panelId: string) => Promise<void>
  readonly onInsert: (context: PanelContext, userInput: string) => Promise<void>
  readonly onVariant: (context: PanelContext, variant: { title: string; description: string; shot_type: string; camera_move: string; video_prompt: string }) => Promise<void>
  readonly onGenerateImage: (panelId: string, count?: number) => Promise<void>
  readonly onOpenAssetLibrary: (characterName?: string | null) => void
}) {
  const t = useTranslations('projectWorkflow.canvas.workspace.detail')
  const { panel } = props.context
  const [shotType, setShotType] = useState(panel.shotType ?? '')
  const [cameraMove, setCameraMove] = useState(panel.cameraMove ?? '')
  const [description, setDescription] = useState(panel.description ?? '')
  const [location, setLocation] = useState(panel.location ?? '')
  const [characters, setCharacters] = useState(parseCharacterRefs(panel.characters))
  const [propsText, setPropsText] = useState(panel.props ?? '')
  const [srtStart, setSrtStart] = useState(panel.srtStart?.toString() ?? '')
  const [srtEnd, setSrtEnd] = useState(panel.srtEnd?.toString() ?? '')
  const [duration, setDuration] = useState(panel.duration?.toString() ?? '')
  const [srtSegment, setSrtSegment] = useState(panel.srtSegment ?? '')
  const [videoPrompt, setVideoPrompt] = useState(panel.videoPrompt ?? '')
  const [photographyRules, setPhotographyRules] = useState(panel.photographyRules ?? '')
  const [actingNotes, setActingNotes] = useState(panel.actingNotes ?? '')
  const [insertText, setInsertText] = useState('')
  const [variantTitle, setVariantTitle] = useState('')
  const [selectedCharacterId, setSelectedCharacterId] = useState('')
  const [selectedAppearanceId, setSelectedAppearanceId] = useState('')
  const [selectedLocationId, setSelectedLocationId] = useState('')
  const [saving, setSaving] = useState(false)
  const { projectId } = useWorkspaceProvider()
  const { data: assets } = useProjectAssets(projectId)
  const selectedCharacter = assets?.characters.find((character) => character.id === selectedCharacterId) ?? null
  const selectedAppearance = selectedCharacter?.appearances.find((appearance) => appearance.id === selectedAppearanceId)
    ?? selectedCharacter?.appearances[0]
    ?? null
  const selectedLocation = assets?.locations.find((assetLocation) => assetLocation.id === selectedLocationId) ?? null
  const hasInvalidNumber = !isValidOptionalNumber(srtStart) || !isValidOptionalNumber(srtEnd) || !isValidOptionalNumber(duration)

  useEffect(() => {
    setShotType(panel.shotType ?? '')
    setCameraMove(panel.cameraMove ?? '')
    setDescription(panel.description ?? '')
    setLocation(panel.location ?? '')
    setCharacters(parseCharacterRefs(panel.characters))
    setPropsText(panel.props ?? '')
    setSrtStart(panel.srtStart?.toString() ?? '')
    setSrtEnd(panel.srtEnd?.toString() ?? '')
    setDuration(panel.duration?.toString() ?? '')
    setSrtSegment(panel.srtSegment ?? '')
    setVideoPrompt(panel.videoPrompt ?? '')
    setPhotographyRules(panel.photographyRules ?? '')
    setActingNotes(panel.actingNotes ?? '')
  }, [panel])

  useEffect(() => {
    const firstCharacter = assets?.characters[0]
    setSelectedCharacterId(firstCharacter?.id ?? '')
    setSelectedAppearanceId(firstCharacter?.appearances[0]?.id ?? '')
    setSelectedLocationId(assets?.locations[0]?.id ?? '')
  }, [assets])

  const save = async () => {
    if (hasInvalidNumber) return
    setSaving(true)
    try {
      await props.onSave(props.context, {
        shotType,
        cameraMove,
        description,
        location: location || null,
        characters: serializeCharacterRefs(characters),
        props: propsText,
        srtStart: srtStart ? Number(srtStart) : null,
        srtEnd: srtEnd ? Number(srtEnd) : null,
        duration: duration ? Number(duration) : null,
        srtSegment,
        videoPrompt,
        photographyRules,
        actingNotes,
      })
    } finally {
      setSaving(false)
    }
  }

  const addSelectedAssetCharacter = () => {
    if (!selectedCharacter) return
    const appearanceName = selectedAppearance?.changeReason ?? ''
    setCharacters((current) => {
      if (current.some((item) => item.name === selectedCharacter.name && item.appearance === appearanceName)) return current
      return [...current, { name: selectedCharacter.name, appearance: appearanceName }]
    })
  }

  return (
    <div className="space-y-4">
      <DetailSection title={t('sections.shotEdit')}>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label={t('fields.shotType')}><TextInput value={shotType} onChange={setShotType} /></Field>
          <Field label={t('fields.cameraMove')}><TextInput value={cameraMove} onChange={setCameraMove} /></Field>
        </div>
        <Field label={t('fields.description')}><TextArea value={description} onChange={setDescription} rows={4} /></Field>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label={t('fields.location')}><TextInput value={location} onChange={setLocation} /></Field>
          <Field label={t('fields.srtStart')}><TextInput value={srtStart} onChange={setSrtStart} /></Field>
          <Field label={t('fields.srtEnd')}><TextInput value={srtEnd} onChange={setSrtEnd} /></Field>
        </div>
        {hasInvalidNumber ? <p className="text-xs text-[var(--glass-tone-danger-fg)]">{t('errors.invalidNumber')}</p> : null}
        <Field label={t('fields.srtSegment')}><TextArea value={srtSegment} onChange={setSrtSegment} rows={3} /></Field>
        <Field label={t('fields.videoPrompt')}><TextArea value={videoPrompt} onChange={setVideoPrompt} rows={4} /></Field>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label={t('fields.photographyRules')}><TextArea value={photographyRules} onChange={setPhotographyRules} rows={5} /></Field>
          <Field label={t('fields.actingNotes')}><TextArea value={actingNotes} onChange={setActingNotes} rows={5} /></Field>
        </div>
      </DetailSection>

      <DetailSection title={t('sections.assets')}>
        <div className="flex flex-wrap gap-2">
          {characters.map((character, index) => (
            <span key={`${character.name}-${character.appearance}-${index}`} className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-1 text-xs">
              {character.appearance ? `${character.name} / ${character.appearance}` : character.name}
              <button type="button" onClick={() => setCharacters((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                <AppIcon name="closeMd" className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label={t('fields.characterAsset')}>
            <select
              value={selectedCharacterId}
              onChange={(event) => {
                const characterId = event.target.value
                const nextCharacter = assets?.characters.find((character) => character.id === characterId) ?? null
                setSelectedCharacterId(characterId)
                setSelectedAppearanceId(nextCharacter?.appearances[0]?.id ?? '')
              }}
              className="w-full rounded-md border border-[var(--glass-stroke-base)] bg-white px-3 py-2 text-sm"
            >
              <option value="">{t('empty.selectCharacter')}</option>
              {assets?.characters.map((character) => (
                <option key={character.id} value={character.id}>{character.name}</option>
              ))}
            </select>
          </Field>
          <Field label={t('fields.appearanceAsset')}>
            <select
              value={selectedAppearanceId}
              onChange={(event) => setSelectedAppearanceId(event.target.value)}
              className="w-full rounded-md border border-[var(--glass-stroke-base)] bg-white px-3 py-2 text-sm"
            >
              <option value="">{t('empty.selectAppearance')}</option>
              {selectedCharacter?.appearances.map((appearance) => (
                <option key={appearance.id} value={appearance.id}>{appearance.changeReason}</option>
              ))}
            </select>
          </Field>
          <Field label={t('fields.locationAsset')}>
            <select
              value={selectedLocationId}
              onChange={(event) => setSelectedLocationId(event.target.value)}
              className="w-full rounded-md border border-[var(--glass-stroke-base)] bg-white px-3 py-2 text-sm"
            >
              <option value="">{t('empty.selectLocation')}</option>
              {assets?.locations.map((assetLocation) => (
                <option key={assetLocation.id} value={assetLocation.id}>{assetLocation.name}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionButton onClick={addSelectedAssetCharacter} disabled={!selectedCharacter}>{t('actions.addSelectedCharacter')}</ActionButton>
          <ActionButton onClick={() => setLocation(selectedLocation?.name ?? '')} disabled={!selectedLocation}>{t('actions.useSelectedLocation')}</ActionButton>
          <ActionButton onClick={() => props.onOpenAssetLibrary(characters[0]?.name ?? null)}>{t('actions.openAssetLibrary')}</ActionButton>
        </div>
        <Field label={t('fields.props')}><TextArea value={propsText} onChange={setPropsText} rows={3} /></Field>
      </DetailSection>

      <DetailSection title={t('sections.panelOperations')}>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label={t('fields.insertPrompt')}><TextArea value={insertText} onChange={setInsertText} rows={3} /></Field>
          <Field label={t('fields.variantTitle')}><TextInput value={variantTitle} onChange={setVariantTitle} /></Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionButton onClick={save} disabled={saving || hasInvalidNumber} variant="primary">{saving ? t('actions.saving') : t('actions.savePanel')}</ActionButton>
          <ActionButton onClick={() => props.onGenerateImage(panel.id, 1)}>{t('actions.generateImage')}</ActionButton>
          <ActionButton onClick={() => props.onCopy(panel.id)}>{t('actions.copyPanel')}</ActionButton>
          <ActionButton onClick={() => props.onInsert(props.context, insertText)} disabled={!insertText.trim()}>{t('actions.insertPanel')}</ActionButton>
          <ActionButton
            onClick={() => props.onVariant(props.context, {
              title: variantTitle || t('defaults.variantTitle'),
              description,
              shot_type: shotType,
              camera_move: cameraMove,
              video_prompt: videoPrompt,
            })}
          >
            {t('actions.createVariant')}
          </ActionButton>
          <ActionButton onClick={() => props.onDelete(props.context)} variant="danger">{t('actions.deletePanel')}</ActionButton>
        </div>
      </DetailSection>
    </div>
  )
}

function ImageDetail(props: {
  readonly context: PanelContext
  readonly node: WorkspaceCanvasFlowNode
  readonly onGenerateImage: (panelId: string, count?: number, referenceUrls?: readonly string[]) => Promise<void>
  readonly onSelectCandidate: (panelId: string, imageUrl: string) => Promise<void>
  readonly onCancelCandidate: (panelId: string) => Promise<void>
  readonly onModifyImage: (storyboardId: string, panelIndex: number, prompt: string, urls: readonly string[]) => Promise<void>
  readonly onDownloadImages: () => Promise<void>
}) {
  const t = useTranslations('projectWorkflow.canvas.workspace.detail')
  const { panel, storyboard } = props.context
  const candidates = candidateImages(panel)
  const [selectedCandidate, setSelectedCandidate] = useState(candidates[0] ?? '')
  const [count, setCount] = useState('1')
  const [referenceUrls, setReferenceUrls] = useState('')
  const [modifyPrompt, setModifyPrompt] = useState('')

  useEffect(() => {
    setSelectedCandidate(candidateImages(panel)[0] ?? '')
    setModifyPrompt('')
  }, [panel])

  return (
    <div className="space-y-4">
      <DetailSection title={t('sections.imagePreview')}>
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="overflow-hidden rounded-lg border border-black/10 bg-white">
            {props.node.data.previewImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={props.node.data.previewImageUrl} alt={props.node.data.title} className="max-h-[420px] w-full object-contain" />
            ) : (
              <div className="flex h-60 items-center justify-center text-sm text-[var(--glass-text-tertiary)]">{t('empty.noImage')}</div>
            )}
          </div>
          <div className="space-y-3">
            <Field label={t('fields.imagePrompt')}><TextArea value={panel.imagePrompt ?? ''} onChange={() => undefined} rows={8} readOnly /></Field>
            {panel.previousImageUrl ? <p className="text-xs text-[var(--glass-text-tertiary)]">{t('messages.panelUndoUnavailable')}</p> : null}
          </div>
        </div>
      </DetailSection>

      <DetailSection title={t('sections.candidates')}>
        {candidates.length > 0 ? (
          <>
            <div className="grid grid-cols-3 gap-2 md:grid-cols-5">
              {candidates.map((url) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => setSelectedCandidate(url)}
                  className={`overflow-hidden rounded-md border ${selectedCandidate === url ? 'border-[#111827]' : 'border-black/10'}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={t('fields.candidateImage')} className="h-24 w-full object-cover" />
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <ActionButton onClick={() => props.onSelectCandidate(panel.id, selectedCandidate)} disabled={!selectedCandidate} variant="primary">{t('actions.confirmCandidate')}</ActionButton>
              <ActionButton onClick={() => props.onCancelCandidate(panel.id)}>{t('actions.cancelCandidate')}</ActionButton>
            </div>
          </>
        ) : (
          <p className="text-sm text-[var(--glass-text-tertiary)]">{t('empty.noCandidates')}</p>
        )}
      </DetailSection>

      <DetailSection title={t('sections.imageGeneration')}>
        <div className="grid gap-3 md:grid-cols-[8rem_1fr]">
          <Field label={t('fields.count')}><TextInput value={count} onChange={setCount} /></Field>
          <Field label={t('fields.referenceUrls')}><TextArea value={referenceUrls} onChange={setReferenceUrls} rows={3} /></Field>
        </div>
        <Field label={t('fields.modifyPrompt')}><TextArea value={modifyPrompt} onChange={setModifyPrompt} rows={3} /></Field>
        <div className="flex flex-wrap gap-2">
          <ActionButton onClick={() => props.onGenerateImage(panel.id, Number(count) || 1, splitUrls(referenceUrls))} variant="primary">{t('actions.regenerateImage')}</ActionButton>
          <ActionButton onClick={() => props.onModifyImage(storyboard.id, panel.panelIndex, modifyPrompt, splitUrls(referenceUrls))} disabled={!modifyPrompt.trim()}>{t('actions.modifyImage')}</ActionButton>
          <ActionButton onClick={props.onDownloadImages}>{t('actions.downloadImages')}</ActionButton>
        </div>
      </DetailSection>
    </div>
  )
}

function VideoDetail(props: {
  readonly context: PanelContext
  readonly node: WorkspaceCanvasFlowNode
  readonly onUpdatePrompt: (storyboardId: string, panelIndex: number, value: string, field?: 'videoPrompt' | 'firstLastFramePrompt') => Promise<void>
  readonly onUpdateModel: (storyboardId: string, panelIndex: number, model: string) => Promise<void>
  readonly onToggleLink: (storyboardId: string, panelIndex: number, linked: boolean) => Promise<void>
  readonly onGenerateVideo: (storyboardId: string, panelIndex: number, panelId: string, model: string, generationOptions: Record<string, string | number | boolean>) => Promise<void>
  readonly onGenerateAllVideos: (model: string, generationOptions: Record<string, string | number | boolean>) => Promise<void>
}) {
  const t = useTranslations('projectWorkflow.canvas.workspace.detail')
  const runtime = useWorkspaceStageRuntime()
  const { panel, storyboard } = props.context
  const [videoPrompt, setVideoPrompt] = useState(panel.videoPrompt ?? '')
  const [firstLastPrompt, setFirstLastPrompt] = useState(panel.firstLastFramePrompt ?? '')
  const [selectedModel, setSelectedModel] = useState(panel.videoModel ?? runtime.videoModel ?? '')
  const [generationOptions, setGenerationOptions] = useState(JSON.stringify(panel.lastVideoGenerationOptions ?? {}, null, 2))
  const parsedGenerationOptions = useMemo(() => parseVideoGenerationOptions(generationOptions), [generationOptions])

  useEffect(() => {
    setVideoPrompt(panel.videoPrompt ?? '')
    setFirstLastPrompt(panel.firstLastFramePrompt ?? '')
    setSelectedModel(panel.videoModel ?? runtime.videoModel ?? '')
    setGenerationOptions(JSON.stringify(panel.lastVideoGenerationOptions ?? {}, null, 2))
  }, [panel, runtime.videoModel])

  return (
    <div className="space-y-4">
      <DetailSection title={t('sections.videoPreview')}>
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="overflow-hidden rounded-lg border border-black/10 bg-black">
            {panel.videoMedia?.url ?? panel.videoUrl ? (
              <video src={panel.videoMedia?.url ?? panel.videoUrl ?? undefined} controls className="max-h-[420px] w-full bg-black" />
            ) : props.node.data.previewImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={props.node.data.previewImageUrl} alt={props.node.data.title} className="max-h-[420px] w-full object-contain" />
            ) : (
              <div className="flex h-60 items-center justify-center bg-white text-sm text-[var(--glass-text-tertiary)]">{t('empty.noVideo')}</div>
            )}
          </div>
          <div className="space-y-3">
            {panel.lipSyncVideoMedia?.url ?? panel.lipSyncVideoUrl ? (
              <video src={panel.lipSyncVideoMedia?.url ?? panel.lipSyncVideoUrl ?? undefined} controls className="w-full rounded-md bg-black" />
            ) : (
              <p className="text-sm text-[var(--glass-text-tertiary)]">{t('empty.noLipSync')}</p>
            )}
            {panel.videoErrorMessage ? <p className="rounded-md bg-[var(--glass-tone-danger-bg)] p-2 text-xs text-[var(--glass-tone-danger-fg)]">{panel.videoErrorMessage}</p> : null}
            {panel.lipSyncErrorMessage ? <p className="rounded-md bg-[var(--glass-tone-danger-bg)] p-2 text-xs text-[var(--glass-tone-danger-fg)]">{panel.lipSyncErrorMessage}</p> : null}
          </div>
        </div>
      </DetailSection>

      <DetailSection title={t('sections.videoControls')}>
        <Field label={t('fields.videoPrompt')}><TextArea value={videoPrompt} onChange={setVideoPrompt} rows={4} /></Field>
        <Field label={t('fields.firstLastFramePrompt')}><TextArea value={firstLastPrompt} onChange={setFirstLastPrompt} rows={3} /></Field>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label={t('fields.videoModel')}>
            <select
              value={selectedModel}
              onChange={(event) => setSelectedModel(event.target.value)}
              className="w-full rounded-md border border-[var(--glass-stroke-base)] bg-white px-3 py-2 text-sm"
            >
              <option value="">{t('empty.selectModel')}</option>
              {runtime.userVideoModels.map((model) => (
                <option key={model.value} value={model.value}>{model.label}</option>
              ))}
            </select>
          </Field>
          <Field label={t('fields.linkedToNextPanel')}>
            <select
              value={panel.linkedToNextPanel ? 'true' : 'false'}
              onChange={(event) => { void props.onToggleLink(storyboard.id, panel.panelIndex, event.target.value === 'true') }}
              className="w-full rounded-md border border-[var(--glass-stroke-base)] bg-white px-3 py-2 text-sm"
            >
              <option value="false">{t('fields.no')}</option>
              <option value="true">{t('fields.yes')}</option>
            </select>
          </Field>
        </div>
        <Field label={t('fields.generationOptions')}><TextArea value={generationOptions} onChange={setGenerationOptions} rows={4} /></Field>
        {parsedGenerationOptions.error ? <p className="text-xs text-[var(--glass-tone-danger-fg)]">{t('errors.invalidGenerationOptions')}</p> : null}
        <div className="flex flex-wrap gap-2">
          <ActionButton onClick={() => props.onUpdatePrompt(storyboard.id, panel.panelIndex, videoPrompt, 'videoPrompt')} variant="primary">{t('actions.saveVideoPrompt')}</ActionButton>
          <ActionButton onClick={() => props.onUpdatePrompt(storyboard.id, panel.panelIndex, firstLastPrompt, 'firstLastFramePrompt')}>{t('actions.saveFirstLastPrompt')}</ActionButton>
          <ActionButton onClick={() => props.onUpdateModel(storyboard.id, panel.panelIndex, selectedModel)} disabled={!selectedModel}>{t('actions.saveVideoModel')}</ActionButton>
          <ActionButton onClick={() => props.onGenerateVideo(storyboard.id, panel.panelIndex, panel.id, selectedModel, parsedGenerationOptions.options)} disabled={!selectedModel || parsedGenerationOptions.error}>{t('actions.generateVideo')}</ActionButton>
          <ActionButton onClick={() => props.onGenerateAllVideos(selectedModel, parsedGenerationOptions.options)} disabled={!selectedModel || parsedGenerationOptions.error}>{t('actions.generateAllVideos')}</ActionButton>
        </div>
      </DetailSection>
    </div>
  )
}

function FinalDetail(props: {
  readonly storyboards: readonly ProjectStoryboard[]
  readonly onGenerateAllVideos: () => Promise<void>
  readonly onDownloadVideos: () => Promise<void>
}) {
  const t = useTranslations('projectWorkflow.canvas.workspace.detail')
  const panels = props.storyboards.flatMap((storyboard) => (storyboard.panels ?? []).map((panel) => ({ storyboard, panel })))
  const videos = panels.filter((item) => item.panel.videoMedia?.url || item.panel.videoUrl)
  const missing = panels.filter((item) => !item.panel.videoMedia?.url && !item.panel.videoUrl)
  const totalDuration = panels.reduce((total, item) => total + (item.panel.duration ?? 0), 0)
  return (
    <div className="space-y-4">
      <DetailSection title={t('sections.finalStats')}>
        <div className="grid gap-3 md:grid-cols-4">
          <p className="rounded-md bg-white p-3 text-sm">{t('stats.totalShots', { count: panels.length })}</p>
          <p className="rounded-md bg-white p-3 text-sm">{t('stats.totalVideos', { count: videos.length })}</p>
          <p className="rounded-md bg-white p-3 text-sm">{t('stats.missingVideos', { count: missing.length })}</p>
          <p className="rounded-md bg-white p-3 text-sm">{t('stats.totalDuration', { count: totalDuration })}</p>
        </div>
      </DetailSection>
      <DetailSection title={t('sections.timelineOrder')}>
        <div className="space-y-2">
          {panels.map(({ panel }, index) => (
            <div key={panel.id} className="flex items-center justify-between rounded-md border border-black/5 bg-white px-3 py-2 text-sm">
              <span>{index + 1}. {panel.description || panel.imagePrompt || panel.id}</span>
              <span className={panel.videoUrl || panel.videoMedia?.url ? 'text-[var(--glass-tone-success-fg)]' : 'text-[var(--glass-text-tertiary)]'}>
                {panel.videoUrl || panel.videoMedia?.url ? t('status.videoReady') : t('status.videoMissing')}
              </span>
            </div>
          ))}
        </div>
      </DetailSection>
      <div className="flex flex-wrap justify-end gap-2">
        <ActionButton onClick={props.onGenerateAllVideos} variant="primary">{t('actions.generateAllVideos')}</ActionButton>
        <ActionButton onClick={props.onDownloadVideos} disabled={videos.length === 0}>{t('actions.downloadVideos')}</ActionButton>
        <span className="rounded-md border border-dashed border-[var(--glass-stroke-base)] px-3 py-2 text-xs text-[var(--glass-text-tertiary)]">
          {t('messages.finalExportUnavailable')}
        </span>
      </div>
    </div>
  )
}

export default function CanvasObjectDetailLayer({
  selectedNode,
  clips,
  storyboards,
  onClose,
}: CanvasObjectDetailLayerProps) {
  const t = useTranslations('projectWorkflow.canvas.workspace.detail')
  const { projectId, episodeId } = useWorkspaceProvider()
  const runtime = useWorkspaceStageRuntime()
  const refreshAssets = useRefreshProjectAssets(projectId)
  const refreshEpisode = useRefreshEpisodeData(projectId, episodeId ?? null)
  const refreshStoryboards = useRefreshStoryboards(episodeId ?? null)
  const updateClipMutation = useUpdateProjectClip(projectId)
  const updatePanelMutation = useUpdateProjectPanel(projectId, episodeId)
  const deletePanelMutation = useDeleteProjectPanel(projectId, episodeId)
  const copyPanelMutation = useCopyProjectPanel(projectId, episodeId)
  const insertPanelMutation = useInsertProjectPanel(projectId, episodeId)
  const variantMutation = useCreateProjectPanelVariant(projectId, episodeId)
  const regenerateImageMutation = useRegenerateProjectPanelImage(projectId, episodeId)
  const selectCandidateMutation = useSelectProjectPanelCandidate(projectId, episodeId)
  const modifyImageMutation = useModifyProjectStoryboardImage(projectId, episodeId)
  const downloadImagesMutation = useDownloadProjectImages(projectId)
  const updatePanelLinkMutation = useUpdateProjectPanelLink(projectId, episodeId)
  const listVideoUrlsMutation = useListProjectEpisodeVideoUrls(projectId)
  const downloadRemoteBlobMutation = useDownloadRemoteBlob()

  const clip = selectedNode?.data.kind === 'scriptClip'
    ? clips.find((item) => item.id === selectedNode.data.targetId) ?? null
    : null
  const panelContext = selectedNode?.data.targetType === 'panel'
    ? findPanelContext(storyboards, selectedNode.data.targetId)
    : null
  const tone = selectedNode ? resolveTone(selectedNode.data.kind) : 'story'

  if (!selectedNode || selectedNode.data.kind === 'analysis') return null

  const refreshAll = async () => {
    await Promise.all([
      refreshAssets(),
      refreshEpisode(),
      refreshStoryboards(),
    ])
  }

  const saveClip = async (clipId: string, data: Record<string, unknown>) => {
    if (!episodeId) return
    await updateClipMutation.mutateAsync({ clipId, data, episodeId })
  }

  const savePanel = async (context: PanelContext, data: Record<string, unknown>) => {
    await updatePanelMutation.mutateAsync({
      storyboardId: context.storyboard.id,
      panelIndex: context.panel.panelIndex,
      id: context.panel.id,
      panelNumber: context.panel.panelNumber,
      ...data,
    })
  }

  const deletePanel = async (context: PanelContext) => {
    if (!window.confirm(t('confirm.deletePanel'))) return
    await deletePanelMutation.mutateAsync({ panelId: context.panel.id })
    onClose()
  }

  const copyPanel = async (panelId: string) => {
    await copyPanelMutation.mutateAsync({ sourcePanelId: panelId, insertAfterPanelId: panelId, includeImages: true })
  }

  const insertPanel = async (context: PanelContext, userInput: string) => {
    await insertPanelMutation.mutateAsync({ storyboardId: context.storyboard.id, insertAfterPanelId: context.panel.id, userInput })
  }

  const createVariant = async (
    context: PanelContext,
    variant: { title: string; description: string; shot_type: string; camera_move: string; video_prompt: string },
  ) => {
    await variantMutation.mutateAsync({
      storyboardId: context.storyboard.id,
      sourcePanelId: context.panel.id,
      insertAfterPanelId: context.panel.id,
      variant,
      includeCharacterAssets: true,
      includeLocationAsset: true,
    })
  }

  const generateImage = async (panelId: string, count = 1, referenceUrls: readonly string[] = []) => {
    await regenerateImageMutation.mutateAsync({
      panelId,
      count,
      ...(referenceUrls.length > 0 ? { extraImageUrls: [...referenceUrls] } : {}),
    })
  }

  const selectCandidate = async (panelId: string, imageUrl: string) => {
    await selectCandidateMutation.mutateAsync({ panelId, selectedImageUrl: imageUrl, action: 'select' })
  }

  const cancelCandidate = async (panelId: string) => {
    await selectCandidateMutation.mutateAsync({ panelId, action: 'cancel' })
  }

  const modifyImage = async (storyboardId: string, panelIndex: number, prompt: string, urls: readonly string[]) => {
    await modifyImageMutation.mutateAsync({
      storyboardId,
      panelIndex,
      modifyPrompt: prompt,
      extraImageUrls: [...urls],
      selectedAssets: [],
    })
  }

  const downloadImages = async () => {
    if (!episodeId) return
    const blob = await downloadImagesMutation.mutateAsync({ episodeId })
    downloadBlob(blob, 'images.zip')
  }

  const downloadVideos = async () => {
    if (!episodeId) return
    const data = await listVideoUrlsMutation.mutateAsync({ episodeId, panelPreferences: {} })
    if (!isRecord(data) || !Array.isArray(data.videos)) return
    await Promise.all(data.videos.map(async (item) => {
      if (!isRecord(item) || typeof item.videoUrl !== 'string') return
      const blob = await downloadRemoteBlobMutation.mutateAsync(item.videoUrl)
      const fileName = typeof item.fileName === 'string' ? item.fileName : 'video.mp4'
      downloadBlob(blob, fileName)
    }))
  }

  const content = (() => {
    if (selectedNode.data.kind === 'scriptClip' && clip) {
      return (
        <ScriptClipDetail
          clip={clip}
          node={selectedNode}
          onSave={saveClip}
          onGenerateStoryboard={async () => runtime.onRunScriptToStoryboard()}
        />
      )
    }

    if ((selectedNode.data.kind === 'shot' || selectedNode.data.kind === 'imageAsset' || selectedNode.data.kind === 'videoClip') && !panelContext) {
      return <p className="text-sm text-[var(--glass-tone-danger-fg)]">{t('errors.panelNotFound')}</p>
    }

    if (selectedNode.data.kind === 'shot' && panelContext) {
      return (
        <ShotDetail
          context={panelContext}
          onSave={savePanel}
          onDelete={deletePanel}
          onCopy={copyPanel}
          onInsert={insertPanel}
          onVariant={createVariant}
          onGenerateImage={async (panelId, count) => {
            await generateImage(panelId, count)
            await refreshAll()
          }}
          onOpenAssetLibrary={(characterName) => runtime.onOpenAssetLibraryForCharacter(characterName ?? null)}
        />
      )
    }

    if (selectedNode.data.kind === 'imageAsset' && panelContext) {
      return (
        <ImageDetail
          context={panelContext}
          node={selectedNode}
          onGenerateImage={async (panelId, count, urls) => {
            await generateImage(panelId, count, urls)
            await refreshAll()
          }}
          onSelectCandidate={async (panelId, imageUrl) => {
            await selectCandidate(panelId, imageUrl)
            await refreshAll()
          }}
          onCancelCandidate={async (panelId) => {
            await cancelCandidate(panelId)
            await refreshAll()
          }}
          onModifyImage={async (storyboardId, panelIndex, prompt, urls) => {
            await modifyImage(storyboardId, panelIndex, prompt, urls)
            await refreshAll()
          }}
          onDownloadImages={downloadImages}
        />
      )
    }

    if (selectedNode.data.kind === 'videoClip' && panelContext) {
      return (
        <VideoDetail
          context={panelContext}
          node={selectedNode}
          onUpdatePrompt={runtime.onUpdateVideoPrompt}
          onUpdateModel={runtime.onUpdatePanelVideoModel}
          onToggleLink={async (storyboardId, panelIndex, linked) => {
            await updatePanelLinkMutation.mutateAsync({ storyboardId, panelIndex, linked })
          }}
          onGenerateVideo={async (storyboardId, panelIndex, panelId, model, options) => {
            await runtime.onGenerateVideo(storyboardId, panelIndex, model, undefined, options, panelId)
          }}
          onGenerateAllVideos={async (model, options) => {
            await runtime.onGenerateAllVideos({ videoModel: model, generationOptions: options })
          }}
        />
      )
    }

    if (selectedNode.data.kind === 'finalTimeline') {
      return (
        <FinalDetail
          storyboards={storyboards}
          onGenerateAllVideos={async () => runtime.onGenerateAllVideos()}
          onDownloadVideos={downloadVideos}
        />
      )
    }

    return <p className="text-sm text-[var(--glass-text-tertiary)]">{t('empty.noDetail')}</p>
  })()

  return (
    <div className="fixed inset-x-6 bottom-6 z-40 max-h-[78vh] overflow-hidden rounded-xl border bg-white shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
      <header className={`flex items-start justify-between gap-4 border-b px-5 py-4 ${toneClassName(tone)}`}>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--glass-text-tertiary)]">{selectedNode.data.eyebrow}</p>
          <h2 className="truncate text-lg font-semibold text-[var(--glass-text-primary)]">{selectedNode.data.title}</h2>
          <p className="mt-1 truncate text-xs text-[var(--glass-text-secondary)]">{selectedNode.data.meta}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-black/10 bg-white p-2 text-[var(--glass-text-secondary)] transition hover:bg-[#f8fafc]"
          aria-label={t('actions.close')}
        >
          <AppIcon name="closeMd" className="h-4 w-4" />
        </button>
      </header>
      <div className="max-h-[calc(78vh-5rem)] overflow-y-auto px-5 py-5">
        {content}
      </div>
    </div>
  )
}
