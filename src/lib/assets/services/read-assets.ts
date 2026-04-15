import { prisma } from '@/lib/prisma'
import { attachMediaFieldsToGlobalCharacter, attachMediaFieldsToGlobalLocation, attachMediaFieldsToGlobalVoice, attachMediaFieldsToProject } from '@/lib/media/attach'
import {
  filterAssetsByKind as filterMappedAssetsByKind,
  mapGlobalCharacterToAsset,
  mapGlobalLocationToAsset,
  mapGlobalPropToAsset,
  mapGlobalVoiceToAsset,
  mapProjectCharacterToAsset,
  mapProjectLocationToAsset,
  mapProjectPropToAsset,
} from '@/lib/assets/mappers'
import type { AssetKind, AssetQueryInput, AssetSummary } from '@/lib/assets/contracts'
import {
  listGlobalLocationBackedAssets,
  listProjectLocationBackedAssets,
} from '@/lib/assets/services/location-backed-assets'

async function readProjectAssets(projectId: string): Promise<AssetSummary[]> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      characters: {
        include: {
          appearances: {
            orderBy: { appearanceIndex: 'asc' },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  })
  if (!project) {
    return []
  }

  const [locations, props] = await Promise.all([
    listProjectLocationBackedAssets(projectId, 'location'),
    listProjectLocationBackedAssets(projectId, 'prop'),
  ])

  const withMedia = await attachMediaFieldsToProject({
    characters: project.characters,
    locations: [...locations, ...props],
  })
  const projectCharacters = (withMedia.characters as unknown as Parameters<typeof mapProjectCharacterToAsset>[0][])
    .map(mapProjectCharacterToAsset)
  const locationLikeAssets = withMedia.locations as Array<Record<string, unknown> & { assetKind?: string }>
  const projectLocations = locationLikeAssets
    .filter((asset) => asset.assetKind === 'location')
    .map((asset) => mapProjectLocationToAsset(asset as Parameters<typeof mapProjectLocationToAsset>[0]))
  const projectProps = locationLikeAssets
    .filter((asset) => asset.assetKind === 'prop')
    .map((asset) => mapProjectPropToAsset(asset as Parameters<typeof mapProjectPropToAsset>[0]))
  return [...projectCharacters, ...projectLocations, ...projectProps]
}

async function readGlobalAssets(input: { folderId?: string | null; userId: string }): Promise<AssetSummary[]> {
  const folderFilter = input.folderId ? { folderId: input.folderId } : {}
  const where = {
    userId: input.userId,
    ...folderFilter,
  }
  const [characters, locations, props, voices] = await Promise.all([
    prisma.globalCharacter.findMany({
      where,
      include: {
        appearances: {
          orderBy: { appearanceIndex: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    }),
    listGlobalLocationBackedAssets({
      userId: input.userId,
      folderId: input.folderId,
      kind: 'location',
    }),
    listGlobalLocationBackedAssets({
      userId: input.userId,
      folderId: input.folderId,
      kind: 'prop',
    }),
    prisma.globalVoice.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    }),
  ])

  const [globalCharacters, globalLocations, globalProps, globalVoices] = await Promise.all([
    Promise.all(characters.map((character) => attachMediaFieldsToGlobalCharacter(character))),
    Promise.all(locations.map((location) => attachMediaFieldsToGlobalLocation(location))),
    Promise.all(props.map((prop) => attachMediaFieldsToGlobalLocation(prop))),
    Promise.all(voices.map((voice) => attachMediaFieldsToGlobalVoice(voice))),
  ])

  return [
    ...(globalCharacters as unknown as Parameters<typeof mapGlobalCharacterToAsset>[0][]).map(mapGlobalCharacterToAsset),
    ...(globalLocations as unknown as Parameters<typeof mapGlobalLocationToAsset>[0][]).map(mapGlobalLocationToAsset),
    ...(globalProps as unknown as Parameters<typeof mapGlobalPropToAsset>[0][]).map(mapGlobalPropToAsset),
    ...(globalVoices as unknown as Parameters<typeof mapGlobalVoiceToAsset>[0][]).map(mapGlobalVoiceToAsset),
  ]
}

export async function readAssets(
  input: AssetQueryInput,
  access?: { userId?: string | null },
): Promise<AssetSummary[]> {
  const assets = input.scope === 'project'
    ? await readProjectAssets(assertProjectId(input.projectId))
    : await readGlobalAssets({
      folderId: input.folderId,
      userId: assertUserId(access?.userId),
    })
  return filterMappedAssetsByKind(assets, input.kind as AssetKind | null | undefined)
}

function assertProjectId(projectId: string | null | undefined): string {
  if (!projectId) {
    throw new Error('projectId is required for project asset scope')
  }
  return projectId
}

function assertUserId(userId: string | null | undefined): string {
  if (!userId) {
    throw new Error('userId is required for global asset scope')
  }
  return userId
}
