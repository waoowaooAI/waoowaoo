import { prisma } from '@/lib/prisma'

export async function ensureProjectLocationImageSlots(input: {
  locationId: string
  count: number
  fallbackDescription: string
}) {
  const existing = await prisma.locationImage.findMany({
    where: { locationId: input.locationId },
    select: { imageIndex: true },
    orderBy: { imageIndex: 'asc' },
  })
  const existingIndexes = new Set(existing.map((item) => item.imageIndex))
  const toCreate: Array<{ locationId: string; imageIndex: number; description: string }> = []

  for (let imageIndex = 0; imageIndex < input.count; imageIndex += 1) {
    if (existingIndexes.has(imageIndex)) continue
    toCreate.push({
      locationId: input.locationId,
      imageIndex,
      description: input.fallbackDescription,
    })
  }

  if (toCreate.length > 0) {
    await prisma.locationImage.createMany({ data: toCreate })
  }
}

export async function ensureGlobalLocationImageSlots(input: {
  locationId: string
  count: number
  fallbackDescription: string
}) {
  const existing = await prisma.globalLocationImage.findMany({
    where: { locationId: input.locationId },
    select: { imageIndex: true },
    orderBy: { imageIndex: 'asc' },
  })
  const existingIndexes = new Set(existing.map((item) => item.imageIndex))
  const toCreate: Array<{ locationId: string; imageIndex: number; description: string }> = []

  for (let imageIndex = 0; imageIndex < input.count; imageIndex += 1) {
    if (existingIndexes.has(imageIndex)) continue
    toCreate.push({
      locationId: input.locationId,
      imageIndex,
      description: input.fallbackDescription,
    })
  }

  if (toCreate.length > 0) {
    await prisma.globalLocationImage.createMany({ data: toCreate })
  }
}
