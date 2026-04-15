'use client'
import { logInfo as _ulogInfo } from '@/lib/logging/core'

import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Character, Location, Prop } from '@/types/project'
import { useProjectAssets } from '@/lib/query/hooks/useProjectAssets'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import {
  fuzzyMatchLocation as fuzzyMatchLocationFromModule,
  getAllClipsAssets as getAllClipsAssetsFromModule,
  parseClipAssets as parseClipAssetsFromModule,
} from './clip-asset-utils'
import ScriptViewScriptPanel from './ScriptViewScriptPanel'
import ScriptViewAssetsPanel from './ScriptViewAssetsPanel'
import { reuseStringArrayIfEqual, reuseStringSetIfEqual } from './selection-sync'
import {
  getPrimaryAppearance,
  getSelectedAppearances,
  processCharacterInClip,
  processLocationInClip,
  processPropInClip,
} from './asset-state-utils'
import { PRIMARY_APPEARANCE_INDEX } from '@/lib/constants'

interface Clip {
  id: string
  clipIndex?: number
  summary: string
  content: string
  screenplay?: string | null
  characters: string | null
  location: string | null
  props: string | null
}

interface Panel {
  panelIndex: number
  characters?: string | null
  location?: string | null
}

interface Storyboard {
  id: string
  clipId?: string
  panels?: Panel[]
}

interface ScriptViewProps {
  projectId: string
  episodeId?: string
  clips: Clip[]
  storyboards?: Storyboard[]
  onClipEdit?: (clipId: string) => void
  onClipUpdate?: (clipId: string, data: Partial<Clip>) => void
  onClipDelete?: (clipId: string) => void
  onGenerateStoryboard?: () => void
  isSubmittingStoryboardBuild?: boolean
  assetsLoading?: boolean
  onOpenAssetLibrary?: () => void
}

function toTranslationValues(values?: Record<string, unknown>) {
  return values as never
}

export default function ScriptView({
  projectId,
  clips,
  onClipEdit,
  onClipUpdate,
  onClipDelete,
  onGenerateStoryboard,
  isSubmittingStoryboardBuild = false,
  assetsLoading = false,
  onOpenAssetLibrary,
}: ScriptViewProps) {
  const t = useTranslations('smartImport')
  const tAssets = useTranslations('assets')
  const tNP = useTranslations('projectWorkflow')
  const tScript = useTranslations('scriptView')
  const tCommon = useTranslations('common')

  const assetsLoadingState = assetsLoading
    ? resolveTaskPresentationState({
      phase: 'processing',
      intent: 'generate',
      resource: 'image',
      hasOutput: false,
    })
    : null

  const { data: assets } = useProjectAssets(projectId)
  const characters: Character[] = useMemo(() => assets?.characters ?? [], [assets?.characters])
  const locations: Location[] = useMemo(() => assets?.locations ?? [], [assets?.locations])
  const props: Prop[] = useMemo(() => assets?.props ?? [], [assets?.props])

  const [activeCharIds, setActiveCharIds] = useState<string[]>([])
  const [activeLocationIds, setActiveLocationIds] = useState<string[]>([])
  const [activePropIds, setActivePropIds] = useState<string[]>([])
  const [selectedAppearanceKeys, setSelectedAppearanceKeys] = useState<Set<string>>(new Set())

  const isManuallyEditingRef = useRef(false)
  const manualEditTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const [assetViewMode, setAssetViewMode] = useState<'all' | string>('all')
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null)
  const [savingClips, setSavingClips] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (clips.length > 0 && !selectedClipId) {
      setSelectedClipId(clips[0].id)
    }
  }, [clips, selectedClipId])

  const fuzzyMatchLocation = (clipLocName: string, libraryLocName: string): boolean =>
    fuzzyMatchLocationFromModule(clipLocName, libraryLocName)

  const parseClipAssets = (clip: Clip) => parseClipAssetsFromModule(clip)
  const getAllClipsAssets = useCallback(() => getAllClipsAssetsFromModule(clips), [clips])

  useEffect(() => {
    if (isManuallyEditingRef.current) {
      _ulogInfo('[ScriptView] skip sync while manual editing')
      return
    }

    let charNames = new Set<string>()
    let locNames = new Set<string>()
    let propNames = new Set<string>()
    let charAppearanceSet = new Set<string>()

    if (assetViewMode === 'all') {
      const all = getAllClipsAssets()
      charNames = all.allCharNames
      locNames = all.allLocNames
      propNames = all.allPropNames
      charAppearanceSet = all.allCharAppearanceSet
    } else {
      const clip = clips.find((c) => c.id === assetViewMode)
      if (clip) {
        const parsed = parseClipAssets(clip)
        charNames = parsed.charNames
        locNames = parsed.locNames
        propNames = parsed.propNames
        charAppearanceSet = parsed.charAppearanceSet
      }
    }

    const matchedCharIds: string[] = []
    const newSelectedKeys = new Set<string>()

    characters.forEach((c) => {
      const aliases = c.name.split('/').map((a) => a.trim())
      const matched = aliases.some((alias) => charNames.has(alias)) || charNames.has(c.name)
      if (!matched) return

      matchedCharIds.push(c.id)
      const matchedAlias =
        aliases.find((alias) =>
          Array.from(charAppearanceSet).some((key) => key.startsWith(`${alias}::`)),
        ) ||
        (Array.from(charAppearanceSet).some((key) => key.startsWith(`${c.name}::`))
          ? c.name
          : null)

      if (!matchedAlias) return
      charAppearanceSet.forEach((key) => {
        if (!key.startsWith(`${matchedAlias}::`)) return
        const appearanceName = key.split('::')[1]
        newSelectedKeys.add(`${c.id}::${appearanceName}`)
      })
    })

    const matchedLocIds = locations
      .filter((l) => Array.from(locNames).some((clipLocName) => fuzzyMatchLocation(clipLocName, l.name)))
      .map((l) => l.id)
    const matchedPropIds = props
      .filter((prop) => Array.from(propNames).some((clipPropName) => clipPropName.toLowerCase() === prop.name.toLowerCase()))
      .map((prop) => prop.id)

    setActiveCharIds((previous) => reuseStringArrayIfEqual(previous, matchedCharIds))
    setActiveLocationIds((previous) => reuseStringArrayIfEqual(previous, matchedLocIds))
    setActivePropIds((previous) => reuseStringArrayIfEqual(previous, matchedPropIds))
    setSelectedAppearanceKeys((previous) => reuseStringSetIfEqual(previous, newSelectedKeys))
  }, [assetViewMode, characters, clips, getAllClipsAssets, locations, props])

  const handleUpdateClipAssets = async (
    type: 'character' | 'location' | 'prop',
    action: 'add' | 'remove',
    id: string,
    optionLabel?: string,
  ) => {
    if (!onClipUpdate) return

    const isAllMode = assetViewMode === 'all'
    const targetClipId = !isAllMode ? assetViewMode : selectedClipId
    if (!isAllMode && !targetClipId) return

    isManuallyEditingRef.current = true
    if (manualEditTimeoutRef.current) {
      clearTimeout(manualEditTimeoutRef.current)
    }
    manualEditTimeoutRef.current = setTimeout(() => {
      isManuallyEditingRef.current = false
      _ulogInfo('[ScriptView] manual editing lock released')
    }, 1500)

    if (type === 'character') {
      const targetChar = characters.find((c) => c.id === id)
      if (!targetChar) return

      const primaryLabel = tAssets('character.primary')
      const finalAppearanceName =
        optionLabel ||
        (targetChar.appearances?.find((appearance) => appearance.appearanceIndex === PRIMARY_APPEARANCE_INDEX)?.changeReason ||
          primaryLabel)

      if (isAllMode && action === 'remove') {
        for (const clip of clips) {
          const newValue = processCharacterInClip({
            clip,
            action: 'remove',
            targetChar,
            appearanceName: optionLabel,
            characters,
            tAssets: (key) => tAssets(key),
          })
          if (newValue !== null) {
            await onClipUpdate(clip.id, { characters: newValue })
          }
        }

        const appearanceKey = `${id}::${finalAppearanceName}`
        const newKeys = new Set(selectedAppearanceKeys)
        newKeys.delete(appearanceKey)
        setSelectedAppearanceKeys(newKeys)

        const remainingAppearances = Array.from(newKeys).filter((k) => k.startsWith(`${id}::`))
        if (remainingAppearances.length === 0) {
          setActiveCharIds(activeCharIds.filter((aid) => aid !== id))
        }
        return
      }

      const clip = clips.find((c) => c.id === targetClipId)
      if (!clip) return

      const newValue = processCharacterInClip({
        clip,
        action,
        targetChar,
        appearanceName: optionLabel,
        characters,
        tAssets: (key) => tAssets(key),
      })

      const appearanceKey = `${id}::${finalAppearanceName}`
      const newKeys = new Set(selectedAppearanceKeys)
      if (action === 'add') {
        newKeys.add(appearanceKey)
        if (!activeCharIds.includes(id)) {
          setActiveCharIds([...activeCharIds, id])
        }
      } else {
        newKeys.delete(appearanceKey)
        const remainingAppearances = Array.from(newKeys).filter((k) => k.startsWith(`${id}::`))
        if (remainingAppearances.length === 0) {
          setActiveCharIds(activeCharIds.filter((aid) => aid !== id))
        }
      }
      setSelectedAppearanceKeys(newKeys)

      if (newValue !== null) {
        await onClipUpdate(targetClipId!, { characters: newValue })
      }
      return
    }

    if (type === 'prop') {
      const targetProp = props.find((item) => item.id === id)
      if (!targetProp) return

      if (isAllMode && action === 'remove') {
        for (const clip of clips) {
          const newValue = processPropInClip({
            clip,
            action: 'remove',
            targetProp,
          })
          if (newValue !== null) {
            await onClipUpdate(clip.id, { props: newValue })
          }
        }
        setActivePropIds(activePropIds.filter((propId) => propId !== id))
        return
      }

      const clip = clips.find((c) => c.id === targetClipId)
      if (!clip) return

      const newValue = processPropInClip({
        clip,
        action,
        targetProp,
      })
      const newActiveIds =
        action === 'add' ? [...activePropIds, id] : activePropIds.filter((propId) => propId !== id)
      setActivePropIds(newActiveIds)
      if (newValue !== null) {
        await onClipUpdate(targetClipId!, { props: newValue })
      }
      return
    }

    const targetLoc = locations.find((l) => l.id === id)
    if (!targetLoc) return

    if (isAllMode && action === 'remove') {
      for (const clip of clips) {
        const newValue = processLocationInClip({
          clip,
          action: 'remove',
          targetLoc,
          fuzzyMatchLocation,
        })
        if (newValue !== null) {
          await onClipUpdate(clip.id, { location: newValue })
        }
      }
      setActiveLocationIds(activeLocationIds.filter((lid) => lid !== id))
      return
    }

    const clip = clips.find((c) => c.id === targetClipId)
    if (!clip) return

    const newValue = processLocationInClip({
      clip,
      action,
      targetLoc,
      locationName: optionLabel,
      fuzzyMatchLocation,
    })

    const newActiveIds =
      action === 'add' ? [...activeLocationIds, id] : activeLocationIds.filter((lid) => lid !== id)
    setActiveLocationIds(newActiveIds)

    if (newValue !== null) {
      await onClipUpdate(targetClipId!, { location: newValue })
    }
  }

  const handleClipUpdateWithSaving = async (clipId: string, data: Partial<Clip>) => {
    if (!onClipUpdate) return
    setSavingClips((prev) => new Set(prev).add(clipId))
    try {
      await onClipUpdate(clipId, data)
    } finally {
      setTimeout(() => {
        setSavingClips((prev) => {
          const next = new Set(prev)
          next.delete(clipId)
          return next
        })
      }, 500)
    }
  }

  const { allCharNames: globalCharNames, allLocNames: globalLocNames, allPropNames: globalPropNames } = getAllClipsAssets()

  const globalCharIds = characters
    .filter((c) => {
      const aliases = c.name.split('/').map((a) => a.trim())
      return aliases.some((alias) => globalCharNames.has(alias)) || globalCharNames.has(c.name)
    })
    .map((c) => c.id)

  const globalLocationIds = locations
    .filter((l) => Array.from(globalLocNames).some((clipLocName) => fuzzyMatchLocation(clipLocName, l.name)))
    .map((l) => l.id)
  const globalPropIds = props
    .filter((prop) => Array.from(globalPropNames).some((clipPropName) => clipPropName.toLowerCase() === prop.name.toLowerCase()))
    .map((prop) => prop.id)

  const globalActiveChars = characters.filter((c) => globalCharIds.includes(c.id))
  const globalActiveLocations = locations.filter((l) => globalLocationIds.includes(l.id))
  const globalActiveProps = props.filter((prop) => globalPropIds.includes(prop.id))

  const charsWithoutImage = globalActiveChars.filter((char) => {
    const appearance = getPrimaryAppearance(char)
    const imageUrl = appearance?.imageUrl || appearance?.imageUrls?.[0]
    return !imageUrl
  })

  const locationsWithoutImage = globalActiveLocations.filter((loc) => {
    const image = (loc.selectedImageId
      ? loc.images?.find((img) => img.id === loc.selectedImageId)
      : undefined) || loc.images?.find((img) => img.isSelected) || loc.images?.find((img) => img.imageUrl)
    return !image?.imageUrl
  })
  const propsWithoutImage = globalActiveProps.filter((prop) => {
    const image = (prop.selectedImageId
      ? prop.images?.find((img) => img.id === prop.selectedImageId)
      : undefined) || prop.images?.find((img) => img.isSelected) || prop.images?.find((img) => img.imageUrl)
    return !image?.imageUrl
  })

  const allAssetsHaveImages = charsWithoutImage.length === 0 && locationsWithoutImage.length === 0 && propsWithoutImage.length === 0
  const missingAssetsCount = charsWithoutImage.length + locationsWithoutImage.length + propsWithoutImage.length

  return (
    <div className="w-full grid grid-cols-12 gap-6 min-h-[400px] lg:h-[calc(100vh-180px)] animate-fadeIn">
      <ScriptViewScriptPanel
        clips={clips}
        selectedClipId={selectedClipId}
        onSelectClip={setSelectedClipId}
        savingClips={savingClips}
        onClipEdit={onClipEdit}
        onClipDelete={onClipDelete}
        onClipUpdate={handleClipUpdateWithSaving}
        t={(key, values) => t(key, toTranslationValues(values))}
        tScript={(key, values) => tScript(key, toTranslationValues(values))}
      />

      <ScriptViewAssetsPanel
        clips={clips}
        assetViewMode={assetViewMode}
        setAssetViewMode={setAssetViewMode}
        setSelectedClipId={setSelectedClipId}
        characters={characters}
        locations={locations}
        props={props}
        activeCharIds={activeCharIds}
        activeLocationIds={activeLocationIds}
        activePropIds={activePropIds}
        selectedAppearanceKeys={selectedAppearanceKeys}
        onUpdateClipAssets={handleUpdateClipAssets}
        onOpenAssetLibrary={onOpenAssetLibrary}
        assetsLoading={assetsLoading}
        assetsLoadingState={assetsLoadingState}
        allAssetsHaveImages={allAssetsHaveImages}
        globalCharIds={globalCharIds}
        globalLocationIds={globalLocationIds}
        globalPropIds={globalPropIds}
        missingAssetsCount={missingAssetsCount}
        onGenerateStoryboard={onGenerateStoryboard}
        isSubmittingStoryboardBuild={isSubmittingStoryboardBuild}
        getSelectedAppearances={(char) => getSelectedAppearances(char, selectedAppearanceKeys)}
        tScript={(key, values) => tScript(key, toTranslationValues(values))}
        tAssets={(key, values) => tAssets(key, toTranslationValues(values))}
        tNP={(key, values) => tNP(key, toTranslationValues(values))}
        tCommon={(key, values) => tCommon(key, toTranslationValues(values))}
      />
    </div>
  )
}
