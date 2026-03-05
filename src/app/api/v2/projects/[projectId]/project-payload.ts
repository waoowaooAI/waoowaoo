type CharacterAppearanceRow = {
  id: string
  appearanceIndex: number
  description: string | null
  imageUrl: string | null
  previousImageUrl: string | null
}

type CharacterRow = {
  id: string
  name: string
  aliases: string[]
  introduction: string | null
  voicePresetId: string | null
  profileData: unknown
  profileConfirmed: boolean
  appearances: CharacterAppearanceRow[]
}

type LocationImageRow = {
  id: string
  imageIndex: number
  description: string | null
  imageUrl: string | null
  isSelected: boolean
}

type LocationRow = {
  id: string
  name: string
  summary: string | null
  locationImages: LocationImageRow[]
}

type EpisodeRow = {
  id: string
  episodeIndex: number
  name: string | null
  novelText: string | null
  audioUrl: string | null
  srtContent: string | null
  createdAt: Date
}

type ProjectRow = {
  id: string
  name: string
  description: string | null
  userId: string
  segmentDuration: number
  episodeDuration: number
  totalDuration: number
  episodeCount: number
  analysisModel: string | null
  imageModel: string | null
  videoModel: string | null
  characterModel: string | null
  locationModel: string | null
  storyboardModel: string | null
  editModel: string | null
  artStyle: string
  videoRatio: string
  capabilityOverrides: string | null
  novelText: string | null
  globalContext: string | null
  createdAt: Date
  updatedAt: Date
  episodes?: EpisodeRow[]
  characters?: CharacterRow[]
  locations?: LocationRow[]
}

type PresentedCharacterAppearance = {
  id: string
  appearanceIndex: number
  changeReason: string
  description: string | null
  descriptions: string[] | null
  imageUrl: string | null
  imageUrls: string[]
  selectedIndex: number | null
  previousImageUrl: string | null
  previousImageUrls: string[]
}

type PresentedCharacter = {
  id: string
  name: string
  aliases: string[]
  introduction: string | null
  voiceId: string | null
  profileData: string | null
  profileConfirmed: boolean
  appearances: PresentedCharacterAppearance[]
}

type PresentedLocationImage = {
  id: string
  imageIndex: number
  description: string | null
  imageUrl: string | null
  previousImageUrl: string | null
  isSelected: boolean
}

type PresentedLocation = {
  id: string
  name: string
  summary: string | null
  selectedImageId: string | null
  images: PresentedLocationImage[]
}

type PresentedEpisode = {
  id: string
  episodeNumber: number
  name: string
  novelText: string | null
  audioUrl: string | null
  srtContent: string | null
  createdAt: Date
}

function stringifyProfileData(profileData: unknown): string | null {
  if (profileData === null || profileData === undefined) return null
  if (typeof profileData === 'string') return profileData
  try {
    return JSON.stringify(profileData)
  } catch {
    return null
  }
}

export function presentCharacters(input: CharacterRow[] | undefined): PresentedCharacter[] {
  const characters = input || []
  return characters.map((character) => ({
    id: character.id,
    name: character.name,
    aliases: Array.isArray(character.aliases) ? character.aliases : [],
    introduction: character.introduction,
    voiceId: character.voicePresetId,
    profileData: stringifyProfileData(character.profileData),
    profileConfirmed: !!character.profileConfirmed,
    appearances: (character.appearances || []).map((appearance) => ({
      id: appearance.id,
      appearanceIndex: appearance.appearanceIndex,
      changeReason: `形象 ${appearance.appearanceIndex + 1}`,
      description: appearance.description,
      descriptions: appearance.description ? [appearance.description] : null,
      imageUrl: appearance.imageUrl,
      imageUrls: appearance.imageUrl ? [appearance.imageUrl] : [],
      selectedIndex: appearance.imageUrl ? 0 : null,
      previousImageUrl: appearance.previousImageUrl,
      previousImageUrls: appearance.previousImageUrl ? [appearance.previousImageUrl] : [],
    })),
  }))
}

export function presentLocations(input: LocationRow[] | undefined): PresentedLocation[] {
  const locations = input || []
  return locations.map((location) => {
    const images = (location.locationImages || []).map((image) => ({
      id: image.id,
      imageIndex: image.imageIndex,
      description: image.description,
      imageUrl: image.imageUrl,
      previousImageUrl: null,
      isSelected: !!image.isSelected,
    }))
    const selectedImage = images.find((image) => image.isSelected) || null
    return {
      id: location.id,
      name: location.name,
      summary: location.summary,
      selectedImageId: selectedImage?.id || null,
      images,
    }
  })
}

export function presentEpisodes(input: EpisodeRow[] | undefined): PresentedEpisode[] {
  const episodes = input || []
  return episodes.map((episode) => ({
    id: episode.id,
    episodeNumber: episode.episodeIndex + 1,
    name: episode.name || `第 ${episode.episodeIndex + 1} 集`,
    novelText: episode.novelText,
    audioUrl: episode.audioUrl,
    srtContent: episode.srtContent,
    createdAt: episode.createdAt,
  }))
}

export function presentProjectData(project: ProjectRow) {
  const episodes = presentEpisodes(project.episodes)
  const characters = presentCharacters(project.characters)
  const locations = presentLocations(project.locations)

  return {
    id: project.id,
    name: project.name,
    description: project.description,
    mode: 'novel-promotion' as const,
    userId: project.userId,
    segmentDuration: project.segmentDuration,
    episodeDuration: project.episodeDuration,
    totalDuration: project.totalDuration,
    episodeCount: project.episodeCount,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    novelPromotionData: {
      id: project.id,
      stage: episodes.length > 0 ? 'script' : 'config',
      importStatus: episodes.length > 0 ? 'completed' : null,
      globalAssetText: project.globalContext || '',
      novelText: project.novelText || '',
      analysisModel: project.analysisModel,
      imageModel: project.imageModel,
      characterModel: project.characterModel,
      locationModel: project.locationModel,
      storyboardModel: project.storyboardModel,
      editModel: project.editModel,
      videoModel: project.videoModel,
      videoRatio: project.videoRatio,
      artStyle: project.artStyle,
      capabilityOverrides: project.capabilityOverrides,
      characters,
      locations,
      episodes,
    },
  }
}
