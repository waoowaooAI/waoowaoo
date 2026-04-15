import { randomUUID } from 'crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  type LocationAvailableSlot,
  stringifyLocationAvailableSlots,
} from '@/lib/location-available-slots'

export type LocationBackedAssetKind = 'location' | 'prop'

type ProjectLocationBackedAssetRow = {
  id: string
  projectId: string
  name: string
  summary: string | null
  selectedImageId: string | null
  sourceGlobalLocationId: string | null
  assetKind: LocationBackedAssetKind
}

type GlobalLocationBackedAssetRow = {
  id: string
  userId: string
  folderId: string | null
  name: string
  summary: string | null
  artStyle: string | null
  assetKind: LocationBackedAssetKind
}

type LocationBackedImageRow = {
  id: string
  imageIndex: number
  description: string | null
  availableSlots: string | null
  imageUrl: string | null
  imageMediaId: string | null
  previousImageUrl: string | null
  previousImageMediaId: string | null
  previousDescription: string | null
  isSelected: boolean
  locationId: string
}

export type ProjectLocationBackedAssetRecord = ProjectLocationBackedAssetRow & {
  images: LocationBackedImageRow[]
}

export type GlobalLocationBackedAssetRecord = GlobalLocationBackedAssetRow & {
  images: LocationBackedImageRow[]
}

function buildImageGroups(
  images: LocationBackedImageRow[],
): Map<string, LocationBackedImageRow[]> {
  const groups = new Map<string, LocationBackedImageRow[]>()
  for (const image of images) {
    const current = groups.get(image.locationId)
    if (current) {
      current.push(image)
      continue
    }
    groups.set(image.locationId, [image])
  }
  for (const groupedImages of groups.values()) {
    groupedImages.sort((left, right) => left.imageIndex - right.imageIndex)
  }
  return groups
}

function normalizeSeedDescriptions(input: {
  descriptions?: string[]
  fallbackDescription: string
}): string[] {
  const normalized = (input.descriptions ?? [])
    .map((description) => description.trim())
    .filter((description) => description.length > 0)

  if (normalized.length > 0) {
    return normalized
  }

  const fallbackDescription = input.fallbackDescription.trim()
  return fallbackDescription.length > 0 ? [fallbackDescription] : []
}

async function readProjectLocationBackedImages(locationIds: string[]): Promise<Map<string, LocationBackedImageRow[]>> {
  if (locationIds.length === 0) {
    return new Map()
  }
  const rows = await prisma.$queryRaw<LocationBackedImageRow[]>(Prisma.sql`
    SELECT
      id,
      imageIndex,
      description,
      availableSlots,
      imageUrl,
      imageMediaId,
      previousImageUrl,
      NULL AS previousImageMediaId,
      previousDescription,
      isSelected,
      locationId
    FROM location_images
    WHERE locationId IN (${Prisma.join(locationIds)})
    ORDER BY locationId ASC, imageIndex ASC
  `)
  return buildImageGroups(rows)
}

async function readGlobalLocationBackedImages(locationIds: string[]): Promise<Map<string, LocationBackedImageRow[]>> {
  if (locationIds.length === 0) {
    return new Map()
  }
  const rows = await prisma.$queryRaw<LocationBackedImageRow[]>(Prisma.sql`
    SELECT
      id,
      imageIndex,
      description,
      availableSlots,
      imageUrl,
      imageMediaId,
      previousImageUrl,
      previousImageMediaId,
      previousDescription,
      isSelected,
      locationId
    FROM global_location_images
    WHERE locationId IN (${Prisma.join(locationIds)})
    ORDER BY locationId ASC, imageIndex ASC
  `)
  return buildImageGroups(rows)
}

export async function listProjectLocationBackedAssets(
  projectId: string,
  kind: LocationBackedAssetKind,
): Promise<ProjectLocationBackedAssetRecord[]> {
  const rows = await prisma.$queryRaw<ProjectLocationBackedAssetRow[]>(Prisma.sql`
    SELECT
      id,
      projectId,
      name,
      summary,
      selectedImageId,
      sourceGlobalLocationId,
      assetKind
    FROM project_locations
    WHERE projectId = ${projectId}
      AND assetKind = ${kind}
    ORDER BY createdAt ASC
  `)
  const imagesByLocationId = await readProjectLocationBackedImages(rows.map((row) => row.id))
  return rows.map((row) => ({
    ...row,
    images: imagesByLocationId.get(row.id) ?? [],
  }))
}

export async function listGlobalLocationBackedAssets(input: {
  userId: string
  kind: LocationBackedAssetKind
  folderId?: string | null
}): Promise<GlobalLocationBackedAssetRecord[]> {
  const folderFilter = input.folderId
    ? Prisma.sql`AND folderId = ${input.folderId}`
    : Prisma.empty
  const rows = await prisma.$queryRaw<GlobalLocationBackedAssetRow[]>(Prisma.sql`
    SELECT
      id,
      userId,
      folderId,
      name,
      summary,
      artStyle,
      assetKind
    FROM global_locations
    WHERE userId = ${input.userId}
      AND assetKind = ${input.kind}
      ${folderFilter}
    ORDER BY createdAt ASC
  `)
  const imagesByLocationId = await readGlobalLocationBackedImages(rows.map((row) => row.id))
  return rows.map((row) => ({
    ...row,
    images: imagesByLocationId.get(row.id) ?? [],
  }))
}

export async function createProjectLocationBackedAsset(input: {
  projectId: string
  name: string
  summary: string
  initialDescription?: string
  kind: LocationBackedAssetKind
}): Promise<{ id: string }> {
  const id = randomUUID()
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO project_locations (
      id,
      projectId,
      name,
      summary,
      selectedImageId,
      sourceGlobalLocationId,
      assetKind,
      createdAt,
      updatedAt
    ) VALUES (
      ${id},
      ${input.projectId},
      ${input.name},
      ${input.summary},
      NULL,
      NULL,
      ${input.kind},
      NOW(),
      NOW()
    )
  `)
  await seedProjectLocationBackedImageSlots({
    locationId: id,
    fallbackDescription: input.initialDescription ?? input.summary,
    descriptions: [input.initialDescription ?? input.summary],
    availableSlots: [],
  })
  return { id }
}

export async function createGlobalLocationBackedAsset(input: {
  userId: string
  folderId?: string | null
  name: string
  summary: string
  initialDescription?: string
  artStyle?: string | null
  kind: LocationBackedAssetKind
}): Promise<{ id: string }> {
  const id = randomUUID()
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO global_locations (
      id,
      userId,
      folderId,
      name,
      summary,
      artStyle,
      assetKind,
      createdAt,
      updatedAt
    ) VALUES (
      ${id},
      ${input.userId},
      ${input.folderId ?? null},
      ${input.name},
      ${input.summary},
      ${input.artStyle ?? null},
      ${input.kind},
      NOW(),
      NOW()
    )
  `)
  await seedGlobalLocationBackedImageSlots({
    locationId: id,
    fallbackDescription: input.initialDescription ?? input.summary,
    descriptions: [input.initialDescription ?? input.summary],
    availableSlots: [],
  })
  return { id }
}

export async function seedProjectLocationBackedImageSlots(input: {
  locationId: string
  fallbackDescription: string
  descriptions?: string[]
  availableSlots?: LocationAvailableSlot[]
  locationImageModel?: {
    createMany: (args: {
      data: Array<{
        locationId: string
        imageIndex: number
        description: string
        availableSlots: string
      }>
    }) => Promise<unknown>
  }
}): Promise<void> {
  const descriptions = normalizeSeedDescriptions(input)
  if (descriptions.length === 0) {
    return
  }
  const availableSlots = stringifyLocationAvailableSlots(input.availableSlots ?? [])

  const locationImageModel = input.locationImageModel ?? prisma.locationImage
  await locationImageModel.createMany({
    data: descriptions.map((description, imageIndex) => ({
      locationId: input.locationId,
      imageIndex,
      description,
      availableSlots,
    })),
  })
}

export async function seedGlobalLocationBackedImageSlots(input: {
  locationId: string
  fallbackDescription: string
  descriptions?: string[]
  availableSlots?: LocationAvailableSlot[]
}): Promise<void> {
  const descriptions = normalizeSeedDescriptions(input)
  if (descriptions.length === 0) {
    return
  }
  const availableSlots = stringifyLocationAvailableSlots(input.availableSlots ?? [])

  await prisma.globalLocationImage.createMany({
    data: descriptions.map((description, imageIndex) => ({
      locationId: input.locationId,
      imageIndex,
      description,
      availableSlots,
    })),
  })
}

export async function deleteProjectLocationBackedAsset(assetId: string): Promise<void> {
  await prisma.$transaction([
    prisma.$executeRaw(Prisma.sql`DELETE FROM location_images WHERE locationId = ${assetId}`),
    prisma.$executeRaw(Prisma.sql`DELETE FROM project_locations WHERE id = ${assetId}`),
  ])
}

export async function deleteGlobalLocationBackedAsset(assetId: string): Promise<void> {
  await prisma.$transaction([
    prisma.$executeRaw(Prisma.sql`DELETE FROM global_location_images WHERE locationId = ${assetId}`),
    prisma.$executeRaw(Prisma.sql`DELETE FROM global_locations WHERE id = ${assetId}`),
  ])
}
