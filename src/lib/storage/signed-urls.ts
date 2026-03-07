import { decodeImageUrlsFromDb } from '@/lib/contracts/image-urls-contract'
import { createScopedLogger } from '@/lib/logging/core'
import { getSignedUrl } from '@/lib/storage'

export type UnknownRecord = Record<string, unknown>

export interface AppLike {
  imageUrls: string | null
  descriptions: string | unknown[] | null
  imageUrl: string | null
  [key: string]: unknown
}

export interface CharacterLike {
  appearances?: AppLike[]
  customVoiceUrl?: string | null
  [key: string]: unknown
}

export interface LocationImageLike {
  imageUrl: string | null
  [key: string]: unknown
}

export interface LocationLike {
  images?: LocationImageLike[]
  [key: string]: unknown
}

export interface ShotLike {
  imageUrl: string | null
  videoUrl: string | null
  [key: string]: unknown
}

export interface PanelLike {
  imageUrl: string | null
  sketchImageUrl: string | null
  videoUrl: string | null
  lipSyncVideoUrl: string | null
  candidateImages: string | null
  panelImageHistory?: string | null
  imageHistory?: string | null
  [key: string]: unknown
}

export interface StoryboardLike {
  panels?: PanelLike[]
  imageHistory?: string | null
  storyboardImageUrl: string | null
  [key: string]: unknown
}

export interface ProjectLike {
  audioUrl?: string | null
  characters?: CharacterLike[]
  locations?: LocationLike[]
  shots?: ShotLike[]
  storyboards?: StoryboardLike[]
  [key: string]: unknown
}

const signedUrlLogger = createScopedLogger({
  module: 'storage.signed-urls',
})
const _ulogError = (...args: unknown[]) => signedUrlLogger.error(...args)

export function keyToSignedUrl(key: string | null, expires: number = 24 * 60 * 60): string | null {
  if (!key) return null
  if (key.startsWith('http://') || key.startsWith('https://')) {
    return key
  }
  return getSignedUrl(key, expires)
}

export function addSignedUrlsToCharacter(character: CharacterLike) {
  const appearances = character.appearances?.map((app) => {
    const imageUrls = decodeImageUrlsFromDb(app.imageUrls, 'appearance.imageUrls')
      .map((key) => keyToSignedUrl(key))
      .filter((url): url is string => !!url)

    let descriptions: string[] | null = null
    if (app.descriptions) {
      try {
        descriptions = typeof app.descriptions === 'string' ? JSON.parse(app.descriptions) : app.descriptions as string[]
      } catch (error: unknown) {
        _ulogError('[signed-url] failed to parse descriptions', app.descriptions, error)
      }
    }

    return {
      ...app,
      imageUrl: keyToSignedUrl(app.imageUrl),
      imageUrls,
      descriptions,
    }
  }) || []

  return {
    ...character,
    appearances,
    customVoiceUrl: character.customVoiceUrl ? keyToSignedUrl(character.customVoiceUrl) : null,
  }
}

export function addSignedUrlToLocation(location: LocationLike) {
  const images = location.images?.map((img) => ({
    ...img,
    imageUrl: keyToSignedUrl(img.imageUrl),
  })) || []

  return {
    ...location,
    images,
  }
}

export function addSignedUrlsToShot(shot: ShotLike) {
  return {
    ...shot,
    imageUrl: keyToSignedUrl(shot.imageUrl),
    videoUrl: keyToSignedUrl(shot.videoUrl),
  }
}

export function addSignedUrlToAssetCharacter(character: { imageUrl: string | null } & UnknownRecord) {
  return {
    ...character,
    imageUrl: keyToSignedUrl(character.imageUrl),
  }
}

export function addSignedUrlToAssetLocation(location: { imageUrl: string | null } & UnknownRecord) {
  return {
    ...location,
    imageUrl: keyToSignedUrl(location.imageUrl),
  }
}

export function addSignedUrlsToStoryboard(storyboard: StoryboardLike) {
  let panels: PanelLike[] = []
  if (storyboard.panels && Array.isArray(storyboard.panels)) {
    panels = storyboard.panels.map((dbPanel) => {
      let panelHistoryCount = 0
      const historyField = dbPanel.panelImageHistory || dbPanel.imageHistory
      if (historyField) {
        try {
          const history = JSON.parse(historyField)
          panelHistoryCount = Array.isArray(history) ? history.length : 0
        } catch {
          panelHistoryCount = 0
        }
      }

      let signedCandidateImages = dbPanel.candidateImages
      if (signedCandidateImages) {
        try {
          const candidates = JSON.parse(signedCandidateImages)
          if (Array.isArray(candidates)) {
            const signedCandidates = candidates.map((candidate) => {
              if (typeof candidate !== 'string') return candidate
              if (candidate.startsWith('PENDING:')) return candidate
              return keyToSignedUrl(candidate) || candidate
            })
            signedCandidateImages = JSON.stringify(signedCandidates)
          }
        } catch {
          signedCandidateImages = dbPanel.candidateImages
        }
      }

      return {
        ...dbPanel,
        imageUrl: dbPanel.imageUrl ? keyToSignedUrl(dbPanel.imageUrl) : null,
        sketchImageUrl: keyToSignedUrl(dbPanel.sketchImageUrl),
        videoUrl: dbPanel.videoUrl && !dbPanel.videoUrl.startsWith('http')
          ? getSignedUrl(dbPanel.videoUrl, 7200)
          : dbPanel.videoUrl,
        lipSyncVideoUrl: dbPanel.lipSyncVideoUrl && !dbPanel.lipSyncVideoUrl.startsWith('http')
          ? getSignedUrl(dbPanel.lipSyncVideoUrl, 7200)
          : dbPanel.lipSyncVideoUrl,
        candidateImages: signedCandidateImages,
        historyCount: panelHistoryCount,
      }
    })
  }

  let historyCount = 0
  if (storyboard.imageHistory) {
    try {
      const history = JSON.parse(storyboard.imageHistory)
      historyCount = Array.isArray(history) ? history.length : 0
    } catch {
      historyCount = 0
    }
  }

  return {
    ...storyboard,
    storyboardImageUrl: keyToSignedUrl(storyboard.storyboardImageUrl),
    panels,
    historyCount,
  }
}

export function addSignedUrlsToProject(project: ProjectLike) {
  return {
    ...project,
    audioUrl: project.audioUrl ? getSignedUrl(project.audioUrl) : project.audioUrl,
    characters: project.characters?.map(addSignedUrlsToCharacter) || [],
    locations: project.locations?.map(addSignedUrlToLocation) || [],
    shots: project.shots?.map(addSignedUrlsToShot) || [],
    storyboards: project.storyboards?.map(addSignedUrlsToStoryboard) || [],
  }
}
