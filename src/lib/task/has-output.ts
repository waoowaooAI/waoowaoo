import { prisma } from '@/lib/prisma'

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export async function hasCharacterAppearanceOutput(params: {
  appearanceId?: string | null
  characterId?: string | null
  appearanceIndex?: number | null
}) {
  if (isNonEmptyString(params.appearanceId)) {
    const row = await prisma.characterAppearance.findUnique({
      where: { id: params.appearanceId },
      select: {
        imageUrl: true,
        previousImageUrl: true,
      },
    })
    if (!row) return false
    return isNonEmptyString(row.imageUrl) || isNonEmptyString(row.previousImageUrl)
  }

  if (!isNonEmptyString(params.characterId)) return false
  const row = await prisma.characterAppearance.findFirst({
    where: {
      characterId: params.characterId,
      ...(typeof params.appearanceIndex === 'number'
        ? { appearanceIndex: params.appearanceIndex }
        : {}),
    },
    select: {
      imageUrl: true,
      previousImageUrl: true,
    },
  })
  if (!row) return false
  return isNonEmptyString(row.imageUrl) || isNonEmptyString(row.previousImageUrl)
}

export async function hasLocationImageOutput(params: {
  imageId?: string | null
  locationId?: string | null
  imageIndex?: number | null
}) {
  if (isNonEmptyString(params.imageId)) {
    const row = await prisma.locationImage.findUnique({
      where: { id: params.imageId },
      select: {
        imageUrl: true,
      },
    })
    if (!row) return false
    return isNonEmptyString(row.imageUrl)
  }

  if (!isNonEmptyString(params.locationId)) return false
  const row = await prisma.locationImage.findFirst({
    where: {
      locationId: params.locationId,
      ...(typeof params.imageIndex === 'number' ? { imageIndex: params.imageIndex } : {}),
    },
    select: {
      imageUrl: true,
    },
  })
  if (!row) return false
  return isNonEmptyString(row.imageUrl)
}

export async function hasPanelImageOutput(panelId: string | null | undefined) {
  if (!isNonEmptyString(panelId)) return false
  const row = await prisma.storyboardEntry.findUnique({
    where: { id: panelId },
    select: {
      imageUrl: true,
      previousImageUrl: true,
    },
  })
  if (!row) return false
  return isNonEmptyString(row.imageUrl) || isNonEmptyString(row.previousImageUrl)
}

export async function hasPanelVideoOutput(_panelId: string | null | undefined) {
  return false
}

export async function hasPanelLipSyncOutput(_panelId: string | null | undefined) {
  return false
}

export async function hasVoiceLineAudioOutput(lineId: string | null | undefined) {
  if (!isNonEmptyString(lineId)) return false
  const line = await prisma.voiceLine.findUnique({
    where: { id: lineId },
    select: {
      audioUrl: true,
    },
  })
  if (!line) return false
  return isNonEmptyString(line.audioUrl)
}

export async function hasGlobalCharacterOutput(_params: {
  characterId?: string | null
  appearanceIndex?: number | null
}) {
  return false
}

export async function hasGlobalLocationOutput(_params: {
  locationId?: string | null
  imageIndex?: number | null
}) {
  return false
}

export async function hasGlobalCharacterAppearanceOutput(_params: {
  targetId?: string | null
  characterId?: string | null
  appearanceIndex?: number | null
  imageIndex?: number | null
}) {
  return false
}

export async function hasGlobalLocationImageOutput(_params: {
  targetId?: string | null
  locationId?: string | null
  imageIndex?: number | null
}) {
  return false
}
