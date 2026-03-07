'use client'

import { useCallback } from 'react'
import type { Character } from './types'

interface RouterLike {
  push: (href: string) => void
}

interface SearchParamsLike {
  toString: () => string
}

interface UseSpeakerAssetNavigationParams {
  episodeId: string
  pathname: string
  router: RouterLike
  searchParams: SearchParamsLike
  onOpenAssetLibraryForCharacter?: (characterId?: string | null) => void
  matchCharacterBySpeaker: (speaker: string) => Character | undefined
}

export function useSpeakerAssetNavigation({
  episodeId,
  pathname,
  router,
  searchParams,
  onOpenAssetLibraryForCharacter,
  matchCharacterBySpeaker,
}: UseSpeakerAssetNavigationParams) {
  const handleOpenAssetLibraryForSpeaker = useCallback((speaker: string) => {
    const matchedCharacter = matchCharacterBySpeaker(speaker)
    if (onOpenAssetLibraryForCharacter) {
      onOpenAssetLibraryForCharacter(matchedCharacter?.id || null)
      return
    }
    const params = new URLSearchParams(searchParams.toString())
    params.set('assetLibrary', '1')
    params.set('episode', episodeId)
    if (matchedCharacter?.id) {
      params.set('focusCharacter', matchedCharacter.id)
    } else {
      params.delete('focusCharacter')
    }
    router.push(`${pathname}?${params.toString()}`)
  }, [
    episodeId,
    matchCharacterBySpeaker,
    onOpenAssetLibraryForCharacter,
    pathname,
    router,
    searchParams,
  ])

  return {
    handleOpenAssetLibraryForSpeaker,
  }
}
