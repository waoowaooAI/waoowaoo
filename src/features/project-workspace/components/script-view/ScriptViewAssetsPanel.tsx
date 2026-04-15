'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Character, Location, Prop, CharacterAppearance } from '@/types/project'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { MediaImageWithLoading } from '@/components/media/MediaImageWithLoading'
import { SpotlightCharCard, SpotlightLocationCard, getSelectedLocationImage } from './SpotlightCards'
import type { TaskPresentationState } from '@/lib/task/presentation'
import { AppIcon } from '@/components/ui/icons'

interface Clip {
  id: string
  location?: string | null
  props?: string | null
}

interface ScriptViewAssetsPanelProps {
  clips: Clip[]
  assetViewMode: 'all' | string
  setAssetViewMode: (mode: 'all' | string) => void
  setSelectedClipId: (clipId: string) => void
  characters: Character[]
  locations: Location[]
  props: Prop[]
  activeCharIds: string[]
  activeLocationIds: string[]
  activePropIds: string[]
  selectedAppearanceKeys: Set<string>
  onUpdateClipAssets: (
    type: 'character' | 'location' | 'prop',
    action: 'add' | 'remove',
    id: string,
    optionLabel?: string,
  ) => Promise<void>
  onOpenAssetLibrary?: () => void
  assetsLoading: boolean
  assetsLoadingState: TaskPresentationState | null
  allAssetsHaveImages: boolean
  globalCharIds: string[]
  globalLocationIds: string[]
  globalPropIds: string[]
  missingAssetsCount: number
  onGenerateStoryboard?: () => void
  isSubmittingStoryboardBuild: boolean
  getSelectedAppearances: (char: Character) => CharacterAppearance[]
  tScript: (key: string, values?: Record<string, unknown>) => string
  tAssets: (key: string, values?: Record<string, unknown>) => string
  tNP: (key: string, values?: Record<string, unknown>) => string
  tCommon: (key: string, values?: Record<string, unknown>) => string
}

function setsEqual<T>(left: Set<T>, right: Set<T>): boolean {
  if (left.size !== right.size) return false
  for (const item of left) {
    if (!right.has(item)) return false
  }
  return true
}

function parseAppearanceKey(key: string): { characterId: string; appearanceName: string } | null {
  const separatorIndex = key.indexOf('::')
  if (separatorIndex <= 0) return null
  const characterId = key.slice(0, separatorIndex)
  const appearanceName = key.slice(separatorIndex + 2)
  if (!characterId || !appearanceName) return null
  return { characterId, appearanceName }
}

function parseLocationNames(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter((item) => !!item)
    }
  } catch {
    // fallback to comma-separated format
  }
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => !!item)
}

function fuzzyMatchLocationName(clipLocName: string, libraryLocName: string): boolean {
  const clipLower = clipLocName.toLowerCase().trim()
  const libraryLower = libraryLocName.toLowerCase().trim()
  if (!clipLower || !libraryLower) return false
  if (clipLower === libraryLower) return true
  if (clipLower.includes(libraryLower)) return true
  if (libraryLower.includes(clipLower)) return true
  return false
}

function readTrimmedLabel(value: string | undefined, fallback: string): string {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return trimmed || fallback
}

function getAppearancePreviewUrl(appearance: CharacterAppearance): string | null {
  if (appearance.imageUrl) return appearance.imageUrl

  const selectedIndex = appearance.selectedIndex
  if (
    typeof selectedIndex === 'number' &&
    selectedIndex >= 0 &&
    selectedIndex < appearance.imageUrls.length
  ) {
    const selectedUrl = appearance.imageUrls[selectedIndex]
    if (selectedUrl) return selectedUrl
  }

  const firstAvailable = appearance.imageUrls.find((url) => !!url)
  return firstAvailable || null
}

export default function ScriptViewAssetsPanel({
  clips,
  assetViewMode,
  setAssetViewMode,
  setSelectedClipId,
  characters,
  locations,
  props,
  activeCharIds,
  activeLocationIds,
  activePropIds,
  selectedAppearanceKeys,
  onUpdateClipAssets,
  onOpenAssetLibrary,
  assetsLoading,
  assetsLoadingState,
  allAssetsHaveImages,
  globalCharIds,
  globalLocationIds,
  globalPropIds,
  missingAssetsCount,
  onGenerateStoryboard,
  isSubmittingStoryboardBuild,
  getSelectedAppearances,
  tScript,
  tAssets,
  tNP,
  tCommon,
}: ScriptViewAssetsPanelProps) {
  const [showAddChar, setShowAddChar] = useState(false)
  const [showAddLoc, setShowAddLoc] = useState(false)
  const [showAddProp, setShowAddProp] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [initialAppearanceKeys, setInitialAppearanceKeys] = useState<Set<string>>(new Set())
  const [pendingAppearanceKeys, setPendingAppearanceKeys] = useState<Set<string>>(new Set())
  const [pendingAppearanceLabels, setPendingAppearanceLabels] = useState<Record<string, string>>({})
  const [pendingLocationIds, setPendingLocationIds] = useState<Set<string>>(new Set())
  const [pendingLocationLabels, setPendingLocationLabels] = useState<Record<string, string>>({})
  const [initialLocationLabels, setInitialLocationLabels] = useState<Record<string, string>>({})
  const [isSavingCharacterSelection, setIsSavingCharacterSelection] = useState(false)
  const [isSavingLocationSelection, setIsSavingLocationSelection] = useState(false)
  const [pendingPropIds, setPendingPropIds] = useState<Set<string>>(new Set())
  const [isSavingPropSelection, setIsSavingPropSelection] = useState(false)
  const hasInitializedCharDraftRef = useRef(false)
  const hasInitializedLocDraftRef = useRef(false)
  const hasInitializedPropDraftRef = useRef(false)
  const charEditorTriggerRef = useRef<HTMLButtonElement | null>(null)
  const charEditorPopoverRef = useRef<HTMLDivElement | null>(null)
  const locEditorTriggerRef = useRef<HTMLButtonElement | null>(null)
  const locEditorPopoverRef = useRef<HTMLDivElement | null>(null)
  const propEditorTriggerRef = useRef<HTMLButtonElement | null>(null)
  const propEditorPopoverRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!showAddChar) {
      hasInitializedCharDraftRef.current = false
      return
    }
    if (hasInitializedCharDraftRef.current) return
    const nextKeys = new Set(selectedAppearanceKeys)
    const nextLabels: Record<string, string> = {}
    nextKeys.forEach((key) => {
      const parsed = parseAppearanceKey(key)
      if (parsed) {
        nextLabels[key] = parsed.appearanceName
      }
    })

    // 用当前右侧面板实际展示的“已选角色/形象”做兜底，确保编辑弹层能正确显示选中态
    activeCharIds.forEach((characterId) => {
      const character = characters.find((item) => item.id === characterId)
      if (!character) return
      const appearances = getSelectedAppearances(character)
      appearances.forEach((appearance) => {
        const appearanceName = appearance.changeReason || tAssets('character.primary')
        const appearanceKey = `${character.id}::${appearanceName}`
        nextKeys.add(appearanceKey)
        if (!nextLabels[appearanceKey]) {
          nextLabels[appearanceKey] = appearanceName
        }
      })
    })

    const baselineKeys = new Set(nextKeys)
    setInitialAppearanceKeys(baselineKeys)
    setPendingAppearanceKeys(baselineKeys)
    setPendingAppearanceLabels(nextLabels)
    hasInitializedCharDraftRef.current = true
  }, [activeCharIds, characters, getSelectedAppearances, selectedAppearanceKeys, showAddChar, tAssets])

  useEffect(() => {
    if (!showAddLoc) {
      hasInitializedLocDraftRef.current = false
      return
    }
    if (hasInitializedLocDraftRef.current) return
    const nextIds = new Set(activeLocationIds)
    const nextLabels: Record<string, string> = {}

    activeLocationIds.forEach((locationId) => {
      const location = locations.find((item) => item.id === locationId)
      if (location) nextLabels[locationId] = location.name
    })

    if (assetViewMode !== 'all') {
      const currentClip = clips.find((clip) => clip.id === assetViewMode)
      const rawLocationNames = parseLocationNames(currentClip?.location)
      activeLocationIds.forEach((locationId) => {
        const location = locations.find((item) => item.id === locationId)
        if (!location) return
        const matchedRawName = rawLocationNames.find((name) => fuzzyMatchLocationName(name, location.name))
        if (matchedRawName) {
          nextLabels[locationId] = matchedRawName
        }
      })
    }

    setPendingLocationIds(nextIds)
    setPendingLocationLabels(nextLabels)
    setInitialLocationLabels(nextLabels)
    hasInitializedLocDraftRef.current = true
  }, [activeLocationIds, assetViewMode, clips, locations, showAddLoc])

  useEffect(() => {
    if (!showAddProp) {
      hasInitializedPropDraftRef.current = false
      return
    }
    if (hasInitializedPropDraftRef.current) return
    setPendingPropIds(new Set(activePropIds))
    hasInitializedPropDraftRef.current = true
  }, [activePropIds, showAddProp])

  useEffect(() => {
    if (!showAddChar && !showAddLoc && !showAddProp) return

    const handlePointerDownOutside = (event: MouseEvent) => {
      const target = event.target as Node

      if (showAddChar) {
        const isInCharPopover = charEditorPopoverRef.current?.contains(target)
        const isInCharTrigger = charEditorTriggerRef.current?.contains(target)
        if (!isInCharPopover && !isInCharTrigger) {
          setShowAddChar(false)
        }
      }

      if (showAddLoc) {
        const isInLocPopover = locEditorPopoverRef.current?.contains(target)
        const isInLocTrigger = locEditorTriggerRef.current?.contains(target)
        if (!isInLocPopover && !isInLocTrigger) {
          setShowAddLoc(false)
        }
      }

      if (showAddProp) {
        const isInPropPopover = propEditorPopoverRef.current?.contains(target)
        const isInPropTrigger = propEditorTriggerRef.current?.contains(target)
        if (!isInPropPopover && !isInPropTrigger) {
          setShowAddProp(false)
        }
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (showAddChar) setShowAddChar(false)
        if (showAddLoc) setShowAddLoc(false)
        if (showAddProp) setShowAddProp(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDownOutside, true)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDownOutside, true)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [showAddChar, showAddLoc, showAddProp])

  const isAllClipsMode = assetViewMode === 'all'

  const hasCharacterLabelChanges = !isAllClipsMode && Array.from(pendingAppearanceKeys).some((key) => {
    const parsed = parseAppearanceKey(key)
    if (!parsed) return false
    const nextLabel = readTrimmedLabel(pendingAppearanceLabels[key], parsed.appearanceName)
    return nextLabel !== parsed.appearanceName
  })

  const hasLocationLabelChanges = !isAllClipsMode && Array.from(pendingLocationIds).some((locationId) => {
    const location = locations.find((item) => item.id === locationId)
    if (!location) return false
    const baseLabel = initialLocationLabels[locationId] || location.name
    const nextLabel = readTrimmedLabel(pendingLocationLabels[locationId], location.name)
    return nextLabel !== baseLabel
  })

  const hasCharacterSelectionChanges = !setsEqual(initialAppearanceKeys, pendingAppearanceKeys) || hasCharacterLabelChanges
  const hasLocationSelectionChanges = !setsEqual(new Set(activeLocationIds), pendingLocationIds) || hasLocationLabelChanges
  const hasPropSelectionChanges = !setsEqual(new Set(activePropIds), pendingPropIds)
  const hasProjectProps = props.length > 0

  const handleConfirmCharacterSelection = async () => {
    if (isSavingCharacterSelection) return
    setIsSavingCharacterSelection(true)
    try {
      const currentKeys = new Set(initialAppearanceKeys)
      const desiredKeys = new Set<string>()
      const desiredItems: Array<{ characterId: string; appearanceName: string; targetKey: string }> = []

      pendingAppearanceKeys.forEach((rawKey) => {
        const parsed = parseAppearanceKey(rawKey)
        if (!parsed) return
        const appearanceName = isAllClipsMode
          ? parsed.appearanceName
          : readTrimmedLabel(pendingAppearanceLabels[rawKey], parsed.appearanceName)
        const targetKey = `${parsed.characterId}::${appearanceName}`
        if (desiredKeys.has(targetKey)) return
        desiredKeys.add(targetKey)
        desiredItems.push({
          characterId: parsed.characterId,
          appearanceName,
          targetKey,
        })
      })

      for (const key of currentKeys) {
        if (desiredKeys.has(key)) continue
        const parsed = parseAppearanceKey(key)
        if (!parsed) continue
        await onUpdateClipAssets('character', 'remove', parsed.characterId, parsed.appearanceName)
      }

      for (const item of desiredItems) {
        if (currentKeys.has(item.targetKey)) continue
        await onUpdateClipAssets('character', 'add', item.characterId, item.appearanceName)
      }

      setShowAddChar(false)
    } finally {
      setIsSavingCharacterSelection(false)
    }
  }

  const handleConfirmLocationSelection = async () => {
    if (isSavingLocationSelection) return
    setIsSavingLocationSelection(true)
    try {
      const currentIds = new Set(activeLocationIds)

      for (const locationId of currentIds) {
        if (pendingLocationIds.has(locationId)) continue
        await onUpdateClipAssets('location', 'remove', locationId)
      }

      for (const locationId of pendingLocationIds) {
        const location = locations.find((item) => item.id === locationId)
        if (!location) continue

        const nextLabel = isAllClipsMode
          ? location.name
          : readTrimmedLabel(pendingLocationLabels[locationId], location.name)
        const baseLabel = initialLocationLabels[locationId] || location.name
        const changedLabel = currentIds.has(locationId) && nextLabel !== baseLabel

        if (changedLabel) {
          await onUpdateClipAssets('location', 'remove', locationId)
          await onUpdateClipAssets('location', 'add', locationId, nextLabel)
          continue
        }

        if (!currentIds.has(locationId)) {
          await onUpdateClipAssets('location', 'add', locationId, nextLabel)
        }
      }

      setShowAddLoc(false)
    } finally {
      setIsSavingLocationSelection(false)
    }
  }

  const handleConfirmPropSelection = async () => {
    if (isSavingPropSelection) return
    setIsSavingPropSelection(true)
    try {
      const currentIds = new Set(activePropIds)

      for (const propId of currentIds) {
        if (pendingPropIds.has(propId)) continue
        await onUpdateClipAssets('prop', 'remove', propId)
      }

      for (const propId of pendingPropIds) {
        if (currentIds.has(propId)) continue
        await onUpdateClipAssets('prop', 'add', propId)
      }

      setShowAddProp(false)
    } finally {
      setIsSavingPropSelection(false)
    }
  }

  return (
    <div className="col-span-12 lg:col-span-4 flex flex-col min-h-[300px] lg:h-full gap-4">
      <div className="relative z-20 flex flex-col gap-2 px-2">
        <h2 className="text-xl font-bold text-[var(--glass-text-primary)] flex items-center gap-2">
          <span className="w-1.5 h-6 bg-[var(--glass-accent-from)] rounded-full" /> {tScript('inSceneAssets')}
        </h2>
        <div className="px-1 pt-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setAssetViewMode('all')}
              className={`glass-btn-base px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-all ${assetViewMode === 'all'
                ? 'bg-gradient-to-br from-[var(--glass-accent-from)] to-[var(--glass-accent-to)] text-white shadow-none'
                : 'glass-btn-secondary text-[var(--glass-text-secondary)]'
                }`}
            >
              {tScript('assetView.allClips')}
            </button>
            {clips.map((clip, idx) => (
              <button
                key={clip.id}
                onClick={() => {
                  setAssetViewMode(clip.id)
                  setSelectedClipId(clip.id)
                }}
                className={`glass-btn-base px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-all ${assetViewMode === clip.id
                  ? 'bg-gradient-to-br from-[var(--glass-accent-from)] to-[var(--glass-accent-to)] text-white shadow-none'
                  : 'glass-btn-secondary text-[var(--glass-text-secondary)]'
                  }`}
              >
                {tScript('segment.title', { index: idx + 1 })}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="relative z-10 flex-1 min-h-0 glass-surface-modal overflow-hidden p-4 pr-3">
        <div className="flex h-full flex-col gap-6 overflow-y-auto pr-1 app-scrollbar">
          {assetsLoading && characters.length === 0 && locations.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-[var(--glass-text-tertiary)] animate-pulse">
              <TaskStatusInline state={assetsLoadingState} />
            </div>
          )}

          <div className="relative">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-bold text-[var(--glass-text-secondary)] flex items-center gap-2">
                {tScript('asset.activeCharacters')} ({characters.filter((c) => activeCharIds.includes(c.id)).reduce((sum, char) => sum + getSelectedAppearances(char).length, 0)})
              </h3>
              <button
                ref={charEditorTriggerRef}
                onClick={() => {
                  setShowAddChar((prev) => !prev)
                  setShowAddLoc(false)
                  setShowAddProp(false)
                }}
                className="inline-flex h-8 w-8 items-center justify-center text-[var(--glass-text-secondary)] hover:text-[var(--glass-tone-info-fg)] transition-colors"
              >
                <AppIcon name="edit" className="h-4 w-4" />
              </button>
            </div>

          {showAddChar && mounted && createPortal(
            <div ref={charEditorPopoverRef} className="fixed right-4 bottom-4 z-[80] glass-surface-modal w-[min(24rem,calc(100vw-2rem))] h-[min(560px,calc(100vh-2rem))] p-3 animate-fadeIn flex flex-col shadow-2xl">
              <div className="shrink-0 text-xs text-[var(--glass-text-tertiary)]">{tCommon('edit')} · {tScript('asset.activeCharacters')}</div>
              <div className="mt-3 flex-1 min-h-0 space-y-4 overflow-y-auto pr-1 app-scrollbar">
                {isAllClipsMode && (
                  <div className="rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)]/40 p-2 text-[11px] text-[var(--glass-text-tertiary)]">
                    当前为“全部片段”视图，文案要求仅在单片段视图可编辑
                  </div>
                )}
                {characters.map((c) => {
                  const appearances = c.appearances || []
                  const sortedAppearances = [...appearances].sort((a, b) => a.appearanceIndex - b.appearanceIndex)
                  return (
                    <div key={c.id} className="space-y-2">
                      <div className="text-xs font-semibold text-[var(--glass-text-primary)]">{c.name}</div>
                      <div className="grid grid-cols-3 gap-2">
                        {sortedAppearances.map((appearance) => {
                          const currentAppearanceName = appearance.changeReason || tAssets('character.primary')
                          const appearanceKey = `${c.id}::${currentAppearanceName}`
                          const isThisAppearanceSelected = pendingAppearanceKeys.has(appearanceKey)
                          const previewUrl = getAppearancePreviewUrl(appearance)
                          return (
                            <div key={`${c.id}-${appearance.appearanceIndex}`} className="space-y-1">
                              <button
                                onClick={() => {
                                  setPendingAppearanceKeys((prev) => {
                                    const next = new Set(prev)
                                    if (isThisAppearanceSelected) {
                                      next.delete(appearanceKey)
                                    } else {
                                      next.add(appearanceKey)
                                    }
                                    return next
                                  })
                                  setPendingAppearanceLabels((prev) => {
                                    const next = { ...prev }
                                    if (isThisAppearanceSelected) {
                                      delete next[appearanceKey]
                                    } else if (!next[appearanceKey]) {
                                      next[appearanceKey] = currentAppearanceName
                                    }
                                    return next
                                  })
                                }}
                                className={`relative w-full rounded-lg overflow-hidden border-2 ${isThisAppearanceSelected ? 'border-[var(--glass-stroke-success)]' : 'border-transparent hover:border-[var(--glass-stroke-focus)]'}`}
                              >
                                <div className="aspect-square bg-[var(--glass-bg-muted)]">
                                  {previewUrl ? (
                                    <MediaImageWithLoading
                                      src={previewUrl}
                                      alt={`${c.name}-${currentAppearanceName}`}
                                      containerClassName="h-full w-full"
                                      className="h-full w-full object-cover"
                                    />
                                  ) : null}
                                </div>
                                {isThisAppearanceSelected && (
                                  <span className="absolute right-1.5 top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--glass-tone-success-fg)] text-white shadow-md">
                                    <AppIcon name="checkMicro" className="h-3 w-3" />
                                  </span>
                                )}
                              </button>
                              {isThisAppearanceSelected && (
                                <input
                                  value={pendingAppearanceLabels[appearanceKey] || currentAppearanceName}
                                  disabled={isAllClipsMode}
                                  onChange={(event) => {
                                    const value = event.target.value
                                    setPendingAppearanceLabels((prev) => ({ ...prev, [appearanceKey]: value }))
                                  }}
                                  className="w-full rounded border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] px-2 py-1 text-xs text-[var(--glass-text-secondary)] outline-none focus:border-[var(--glass-stroke-focus)] disabled:cursor-not-allowed disabled:opacity-60"
                                />
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="mt-3 flex shrink-0 items-center justify-end gap-2 border-t border-[var(--glass-stroke-base)] pt-3">
                <button
                  onClick={() => setShowAddChar(false)}
                  disabled={isSavingCharacterSelection}
                  className="glass-btn-base glass-btn-secondary rounded-lg px-3 py-1.5 text-xs text-[var(--glass-text-secondary)]"
                >
                  {tCommon('cancel')}
                </button>
                <button
                  onClick={() => void handleConfirmCharacterSelection()}
                  disabled={isSavingCharacterSelection || !hasCharacterSelectionChanges}
                  className="glass-btn-base glass-btn-primary rounded-lg px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {tCommon('confirm')}
                </button>
              </div>
            </div>,
            document.body,
          )}

            {activeCharIds.length === 0 ? (
              <div className="text-center text-[var(--glass-text-tertiary)] text-sm py-4">{tScript('screenplay.noCharacter')}</div>
            ) : (
              <div className="grid grid-cols-3 gap-3 px-1 py-1">
                {characters
                  .filter((c) => activeCharIds.includes(c.id))
                  .flatMap((char) => {
                    const selectedApps = getSelectedAppearances(char)
                    if (selectedApps.length === 0) {
                      return (
                        <div key={`${char.id}-missing`} className="min-w-0">
                          <SpotlightCharCard
                            char={char}
                            appearance={undefined}
                            isActive={true}
                            onClick={() => { }}
                            onOpenAssetLibrary={onOpenAssetLibrary}
                            onRemove={() => void onUpdateClipAssets('character', 'remove', char.id, tScript('asset.defaultAppearance'))}
                          />
                        </div>
                      )
                    }
                    return selectedApps.map((appearance) => (
                      <div key={`${char.id}-${appearance.id}`} className="min-w-0">
                        <SpotlightCharCard
                          char={char}
                          appearance={appearance}
                          isActive={true}
                          onClick={() => { }}
                          onOpenAssetLibrary={onOpenAssetLibrary}
                          onRemove={() => void onUpdateClipAssets('character', 'remove', char.id, appearance.changeReason || tScript('asset.defaultAppearance'))}
                        />
                      </div>
                    ))
                  })}
              </div>
            )}
          </div>

          <div className="relative">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-bold text-[var(--glass-text-secondary)]">{tScript('asset.activeLocations')} ({activeLocationIds.length})</h3>
              <button
                ref={locEditorTriggerRef}
                onClick={() => {
                  setShowAddLoc((prev) => !prev)
                  setShowAddChar(false)
                  setShowAddProp(false)
                }}
                className="inline-flex h-8 w-8 items-center justify-center text-[var(--glass-text-secondary)] hover:text-[var(--glass-tone-info-fg)] transition-colors"
              >
                <AppIcon name="edit" className="h-4 w-4" />
              </button>
            </div>

          {showAddLoc && mounted && createPortal(
            <div ref={locEditorPopoverRef} className="fixed right-4 bottom-4 z-[80] glass-surface-modal w-[min(24rem,calc(100vw-2rem))] h-[min(560px,calc(100vh-2rem))] p-3 animate-fadeIn flex flex-col shadow-2xl">
              <div className="shrink-0 text-xs text-[var(--glass-text-tertiary)]">{tCommon('edit')} · {tScript('asset.activeLocations')}</div>
              <div className="mt-3 flex-1 min-h-0 overflow-y-auto pr-1 app-scrollbar">
                {isAllClipsMode && (
                  <div className="mb-3 rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)]/40 p-2 text-[11px] text-[var(--glass-text-tertiary)]">
                    当前为“全部片段”视图，场景文案要求仅在单片段视图可编辑
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {locations.map((location) => {
                    const isSelected = pendingLocationIds.has(location.id)
                    const previewImage = getSelectedLocationImage(location)?.imageUrl || null
                    return (
                      <div key={location.id} className="space-y-1">
                        <button
                          onClick={() => {
                            setPendingLocationIds((prev) => {
                              const next = new Set(prev)
                              if (isSelected) {
                                next.delete(location.id)
                              } else {
                                next.add(location.id)
                              }
                              return next
                            })
                            setPendingLocationLabels((prev) => {
                              const next = { ...prev }
                              if (isSelected) {
                                delete next[location.id]
                              } else if (!next[location.id]) {
                                next[location.id] = location.name
                              }
                              return next
                            })
                          }}
                          className={`relative w-full overflow-hidden rounded-lg border-2 text-left transition-colors ${isSelected ? 'border-[var(--glass-stroke-success)]' : 'border-transparent hover:border-[var(--glass-stroke-focus)]'}`}
                        >
                          <div className="aspect-video bg-[var(--glass-bg-muted)]">
                            {previewImage ? (
                              <MediaImageWithLoading
                                src={previewImage}
                                alt={location.name}
                                containerClassName="h-full w-full"
                                className="h-full w-full object-cover"
                              />
                            ) : null}
                          </div>
                          <div className="truncate px-2 py-1 text-xs font-medium text-[var(--glass-text-secondary)]">
                            {location.name}
                          </div>
                          {isSelected && (
                            <span className="absolute right-1.5 top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--glass-tone-success-fg)] text-white shadow-md">
                              <AppIcon name="checkMicro" className="h-3 w-3" />
                            </span>
                          )}
                        </button>
                        {isSelected && (
                          <input
                            value={pendingLocationLabels[location.id] || location.name}
                            disabled={isAllClipsMode}
                            onChange={(event) => {
                              const value = event.target.value
                              setPendingLocationLabels((prev) => ({ ...prev, [location.id]: value }))
                            }}
                            className="w-full rounded border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] px-2 py-1 text-xs text-[var(--glass-text-secondary)] outline-none focus:border-[var(--glass-stroke-focus)] disabled:cursor-not-allowed disabled:opacity-60"
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
              <div className="mt-3 flex shrink-0 items-center justify-end gap-2 border-t border-[var(--glass-stroke-base)] pt-3">
                <button
                  onClick={() => setShowAddLoc(false)}
                  disabled={isSavingLocationSelection}
                  className="glass-btn-base glass-btn-secondary rounded-lg px-3 py-1.5 text-xs text-[var(--glass-text-secondary)]"
                >
                  {tCommon('cancel')}
                </button>
                <button
                  onClick={() => void handleConfirmLocationSelection()}
                  disabled={isSavingLocationSelection || !hasLocationSelectionChanges}
                  className="glass-btn-base glass-btn-primary rounded-lg px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {tCommon('confirm')}
                </button>
              </div>
            </div>,
            document.body,
          )}

            {activeLocationIds.length === 0 ? (
              <div className="text-center text-[var(--glass-text-tertiary)] text-sm py-4">{tScript('screenplay.noLocation')}</div>
            ) : (
              <div className="grid grid-cols-2 gap-3 px-1 py-1">
                {locations.filter((l) => activeLocationIds.includes(l.id)).map((loc) => (
                  <div key={loc.id} className="min-w-0">
                    <SpotlightLocationCard
                      location={loc}
                      isActive={true}
                      onClick={() => { }}
                      onOpenAssetLibrary={onOpenAssetLibrary}
                      onRemove={() => void onUpdateClipAssets('location', 'remove', loc.id)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {hasProjectProps ? (
          <div className="relative">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-bold text-[var(--glass-text-secondary)]">道具 ({activePropIds.length})</h3>
              <button
                ref={propEditorTriggerRef}
                onClick={() => {
                  setShowAddProp((prev) => !prev)
                  setShowAddChar(false)
                  setShowAddLoc(false)
                }}
                className="inline-flex h-8 w-8 items-center justify-center text-[var(--glass-text-secondary)] hover:text-[var(--glass-tone-info-fg)] transition-colors"
              >
                <AppIcon name="edit" className="h-4 w-4" />
              </button>
            </div>

          {showAddProp && mounted && createPortal(
            <div ref={propEditorPopoverRef} className="fixed right-4 bottom-4 z-[80] glass-surface-modal w-[min(24rem,calc(100vw-2rem))] h-[min(560px,calc(100vh-2rem))] p-3 animate-fadeIn flex flex-col shadow-2xl">
              <div className="shrink-0 text-xs text-[var(--glass-text-tertiary)]">{tCommon('edit')} · 道具</div>
              <div className="mt-3 flex-1 min-h-0 overflow-y-auto pr-1 app-scrollbar">
                <div className="grid grid-cols-2 gap-2">
                  {props.map((prop) => {
                    const isSelected = pendingPropIds.has(prop.id)
                    const previewImage = getSelectedLocationImage(prop as unknown as Location)?.imageUrl || null
                    return (
                      <button
                        key={prop.id}
                        onClick={() => {
                          setPendingPropIds((prev) => {
                            const next = new Set(prev)
                            if (isSelected) {
                              next.delete(prop.id)
                            } else {
                              next.add(prop.id)
                            }
                            return next
                          })
                        }}
                        className={`relative w-full overflow-hidden rounded-lg border-2 text-left transition-colors ${isSelected ? 'border-[var(--glass-stroke-success)]' : 'border-transparent hover:border-[var(--glass-stroke-focus)]'}`}
                      >
                        <div className="aspect-video bg-[var(--glass-bg-muted)]">
                          {previewImage ? (
                            <MediaImageWithLoading
                              src={previewImage}
                              alt={prop.name}
                              containerClassName="h-full w-full"
                              className="h-full w-full object-cover"
                            />
                          ) : null}
                        </div>
                        <div className="truncate px-2 py-1 text-xs font-medium text-[var(--glass-text-secondary)]">
                          {prop.name}
                        </div>
                        {isSelected && (
                          <span className="absolute right-1.5 top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--glass-tone-success-fg)] text-white shadow-md">
                            <AppIcon name="checkMicro" className="h-3 w-3" />
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="mt-3 flex shrink-0 items-center justify-end gap-2 border-t border-[var(--glass-stroke-base)] pt-3">
                <button
                  onClick={() => setShowAddProp(false)}
                  disabled={isSavingPropSelection}
                  className="glass-btn-base glass-btn-secondary rounded-lg px-3 py-1.5 text-xs text-[var(--glass-text-secondary)]"
                >
                  {tCommon('cancel')}
                </button>
                <button
                  onClick={() => void handleConfirmPropSelection()}
                  disabled={isSavingPropSelection || !hasPropSelectionChanges}
                  className="glass-btn-base glass-btn-primary rounded-lg px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {tCommon('confirm')}
                </button>
              </div>
            </div>,
            document.body,
          )}

            {activePropIds.length === 0 ? (
              <div className="text-center text-[var(--glass-text-tertiary)] text-sm py-4">当前片段未选择道具</div>
            ) : (
              <div className="grid grid-cols-2 gap-3 px-1 py-1">
                {props.filter((prop) => activePropIds.includes(prop.id)).map((prop) => (
                  <div key={prop.id} className="min-w-0">
                    <SpotlightLocationCard
                      location={prop as unknown as Location}
                      isActive={true}
                      onClick={() => { }}
                      onOpenAssetLibrary={onOpenAssetLibrary}
                      onRemove={() => void onUpdateClipAssets('prop', 'remove', prop.id)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
          ) : null}
        </div>
      </div>

      <div className="mt-4 mb-4">
        {!allAssetsHaveImages && globalCharIds.length + globalLocationIds.length + globalPropIds.length > 0 && (
          <div className="mb-3 p-4 bg-[var(--glass-bg-surface)] border border-[var(--glass-stroke-base)] rounded-2xl shadow-sm">
            <p className="text-sm font-medium text-[var(--glass-text-primary)]">{tScript('generate.missingAssets', { count: missingAssetsCount })}</p>
            <p className="text-xs text-[var(--glass-text-tertiary)] mt-0.5">
              {tScript('generate.missingAssetsTip')}
              <button onClick={onOpenAssetLibrary} className="text-[var(--glass-tone-info-fg)] hover:underline mx-1">
                {tNP('buttons.assetLibrary')}
              </button>
              {tScript('generate.missingAssetsTipLink')}
            </p>
          </div>
        )}
        <button
          onClick={onGenerateStoryboard}
          disabled={isSubmittingStoryboardBuild || clips.length === 0 || !allAssetsHaveImages}
          className="glass-btn-base glass-btn-primary w-full py-4 text-lg font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {isSubmittingStoryboardBuild ? tScript('generate.generating') : tScript('generate.startGenerate')}
        </button>
      </div>
    </div>
  )
}
