import type {
  Character,
  Location,
  ProjectEpisodeSummary,
  ProjectWorkflowData,
  Prop,
  ProjectClip,
  ProjectShot,
  ProjectStoryboard,
} from '@/types/project'

type ProjectLikeRecord = {
  id: string
  name: string
  userId: string
} & Record<string, unknown>

type ProjectRecord = Record<string, unknown>

type ProjectLocationLike = ProjectRecord & {
  assetKind?: string | null
}

type ProjectWorkflowSource = {
  globalAssetText?: string | null
  analysisModel?: string | null
  imageModel?: string | null
  characterModel?: string | null
  locationModel?: string | null
  storyboardModel?: string | null
  editModel?: string | null
  videoModel?: string | null
  audioModel?: string | null
  videoRatio?: string | null
  capabilityOverrides?: ProjectWorkflowData['capabilityOverrides']
  artStyle?: string | null
  artStylePrompt?: string | null
  videoResolution?: string | null
  imageResolution?: string | null
  lastEpisodeId?: string | null
  importStatus?: string | null
  characters?: ProjectRecord[]
  locations?: ProjectLocationLike[]
  episodes?: ProjectRecord[]
  clips?: ProjectRecord[]
  storyboards?: ProjectRecord[]
  shots?: ProjectRecord[]
}

function splitProjectLocations(locations: ProjectLocationLike[] | undefined): Pick<ProjectWorkflowData, 'locations' | 'props'> {
  const source = locations || []
  return {
    locations: source.filter((item) => item.assetKind !== 'prop') as unknown as Location[],
    props: source.filter((item) => item.assetKind === 'prop') as unknown as Prop[],
  }
}

function buildProjectWorkflowData(source: ProjectWorkflowSource): ProjectWorkflowData {
  const assets = splitProjectLocations(source.locations)

  return {
    globalAssetText: source.globalAssetText ?? null,
    analysisModel: source.analysisModel ?? null,
    imageModel: source.imageModel ?? null,
    characterModel: source.characterModel ?? null,
    locationModel: source.locationModel ?? null,
    storyboardModel: source.storyboardModel ?? null,
    editModel: source.editModel ?? null,
    videoModel: source.videoModel ?? null,
    audioModel: source.audioModel ?? null,
    videoRatio: source.videoRatio ?? null,
    capabilityOverrides: source.capabilityOverrides ?? null,
    artStyle: source.artStyle ?? null,
    artStylePrompt: source.artStylePrompt ?? null,
    videoResolution: source.videoResolution ?? null,
    imageResolution: source.imageResolution ?? null,
    lastEpisodeId: source.lastEpisodeId ?? null,
    importStatus: source.importStatus ?? null,
    characters: (source.characters || []) as unknown as Character[],
    locations: assets.locations || [],
    props: assets.props || [],
    episodes: (source.episodes || []) as unknown as ProjectEpisodeSummary[],
    clips: (source.clips || []) as unknown as ProjectClip[],
    storyboards: (source.storyboards || []) as unknown as ProjectStoryboard[],
    shots: (source.shots || []) as unknown as ProjectShot[],
  }
}

export function buildProjectReadModel<TProject extends ProjectLikeRecord>(
  project: TProject,
  workflow: ProjectWorkflowSource,
): TProject & ProjectWorkflowData {
  return {
    ...project,
    ...buildProjectWorkflowData(workflow),
  }
}
