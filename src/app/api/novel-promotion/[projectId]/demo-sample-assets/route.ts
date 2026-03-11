import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, getRequestId } from '@/lib/api-errors'
import { PRIMARY_APPEARANCE_INDEX } from '@/lib/constants'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { getProjectModelConfig, buildImageBillingPayload } from '@/lib/config-service'
import { submitTask } from '@/lib/task/submitter'
import { TASK_TYPE } from '@/lib/task/types'
import { buildDefaultTaskBillingInfo } from '@/lib/billing'
import { withTaskUiPayload } from '@/lib/task/ui-payload'
import { encodeImageUrls } from '@/lib/contracts/image-urls-contract'

type JourneyType = 'film_video' | 'manga_webtoon'
type CharacterStrategyId = 'consistency-first' | 'emotion-first' | 'dynamic-action'
type EnvironmentPresetId = 'city-night-neon' | 'forest-mist-dawn' | 'interior-cinematic'

const ENVIRONMENT_COVER_MAP: Record<EnvironmentPresetId, string> = {
  'city-night-neon': '/demo/novel-input/neon-city.svg',
  'forest-mist-dawn': '/demo/novel-input/forest-dawn.svg',
  'interior-cinematic': '/demo/novel-input/interior-cinematic.svg',
}

function toJourneyType(input: unknown): JourneyType {
  return input === 'manga_webtoon' ? 'manga_webtoon' : 'film_video'
}

function toCharacterStrategy(input: unknown): CharacterStrategyId {
  if (input === 'emotion-first' || input === 'dynamic-action') return input
  return 'consistency-first'
}

function toEnvironmentPreset(input: unknown): EnvironmentPresetId {
  if (input === 'forest-mist-dawn' || input === 'interior-cinematic') return input
  return 'city-night-neon'
}

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params

  const authResult = await requireProjectAuth(projectId)
  if (isErrorResponse(authResult)) return authResult
  const { session, novelData } = authResult

  const body = await request.json().catch(() => ({}))
  const locale = resolveRequiredTaskLocale(request, body)

  const journeyType = toJourneyType(body?.journeyType)
  const selectedCharacterStrategy = toCharacterStrategy(body?.selectedCharacterStrategy)
  const selectedEnvironmentId = toEnvironmentPreset(body?.selectedEnvironmentId)
  const artStyle = typeof body?.artStyle === 'string' && body.artStyle.trim() ? body.artStyle.trim() : 'american-comic'

  const nowTag = new Date().toISOString().replace(/[:.]/g, '-').slice(11, 19)
  const laneLabel = journeyType === 'manga_webtoon' ? 'Manga' : 'Film'
  const mockImageUrl = ENVIRONMENT_COVER_MAP[selectedEnvironmentId]

  const characterSeeds = [
    {
      name: `[Demo ${laneLabel}] Hero ${nowTag}`,
      description: `Demo character seed (${selectedCharacterStrategy}) for ${laneLabel} journey`,
    },
    {
      name: `[Demo ${laneLabel}] Companion ${nowTag}`,
      description: `Support character seed for ${laneLabel} journey`,
    },
  ]

  const locationSeeds = [
    {
      name: `[Demo ${laneLabel}] Main Scene ${nowTag}`,
      summary: `Environment preset: ${selectedEnvironmentId}`,
      description: `Primary scene seed for ${laneLabel} demo (${selectedEnvironmentId})`,
    },
    {
      name: `[Demo ${laneLabel}] Secondary Scene ${nowTag}`,
      summary: `Secondary environment for quick storyboard showcase`,
      description: `Secondary scene seed for ${laneLabel} demo`,
    },
  ]

  const projectModelConfig = await getProjectModelConfig(projectId, session.user.id)

  let realTriggered = 0
  let fallbackApplied = 0

  const createdCharacters: string[] = []
  const createdLocations: string[] = []

  for (const seed of characterSeeds) {
    const created = await prisma.novelPromotionCharacter.create({
      data: {
        novelPromotionProjectId: novelData.id,
        name: seed.name,
        aliases: null,
      },
    })

    const appearance = await prisma.characterAppearance.create({
      data: {
        characterId: created.id,
        appearanceIndex: PRIMARY_APPEARANCE_INDEX,
        changeReason: 'VAT-121 demo sample assets',
        description: seed.description,
        descriptions: JSON.stringify([seed.description]),
        imageUrls: encodeImageUrls([]),
        previousImageUrls: encodeImageUrls([]),
      },
    })

    createdCharacters.push(created.id)

    try {
      const basePayload = {
        type: 'character',
        id: created.id,
        appearanceId: appearance.id,
        appearanceIndex: PRIMARY_APPEARANCE_INDEX,
        artStyle,
      }

      const billingPayload = await buildImageBillingPayload({
        projectId,
        userId: session.user.id,
        imageModel: projectModelConfig.characterModel,
        basePayload,
      })

      await submitTask({
        userId: session.user.id,
        locale,
        requestId: getRequestId(request),
        projectId,
        type: TASK_TYPE.IMAGE_CHARACTER,
        targetType: 'CharacterAppearance',
        targetId: appearance.id,
        payload: withTaskUiPayload(billingPayload, { hasOutputAtStart: false }),
        dedupeKey: `${TASK_TYPE.IMAGE_CHARACTER}:${appearance.id}`,
        billingInfo: buildDefaultTaskBillingInfo(TASK_TYPE.IMAGE_CHARACTER, billingPayload),
      })
      realTriggered += 1
    } catch {
      await prisma.characterAppearance.update({
        where: { id: appearance.id },
        data: {
          imageUrl: mockImageUrl,
          imageUrls: encodeImageUrls([mockImageUrl]),
          selectedIndex: 0,
        },
      })
      fallbackApplied += 1
    }
  }

  for (const seed of locationSeeds) {
    const location = await prisma.novelPromotionLocation.create({
      data: {
        novelPromotionProjectId: novelData.id,
        name: seed.name,
        summary: seed.summary,
      },
    })

    const image = await prisma.locationImage.create({
      data: {
        locationId: location.id,
        imageIndex: 0,
        description: seed.description,
      },
    })

    createdLocations.push(location.id)

    try {
      const basePayload = {
        type: 'location',
        id: location.id,
        imageIndex: 0,
      }

      const billingPayload = await buildImageBillingPayload({
        projectId,
        userId: session.user.id,
        imageModel: projectModelConfig.locationModel,
        basePayload,
      })

      await submitTask({
        userId: session.user.id,
        locale,
        requestId: getRequestId(request),
        projectId,
        type: TASK_TYPE.IMAGE_LOCATION,
        targetType: 'LocationImage',
        targetId: image.id,
        payload: withTaskUiPayload(billingPayload, { hasOutputAtStart: false }),
        dedupeKey: `${TASK_TYPE.IMAGE_LOCATION}:${image.id}`,
        billingInfo: buildDefaultTaskBillingInfo(TASK_TYPE.IMAGE_LOCATION, billingPayload),
      })
      realTriggered += 1
    } catch {
      await prisma.locationImage.update({
        where: { id: image.id },
        data: {
          imageUrl: mockImageUrl,
        },
      })
      fallbackApplied += 1
    }
  }

  const mode = realTriggered > 0 && fallbackApplied > 0
    ? 'mixed'
    : realTriggered > 0
      ? 'real'
      : 'fallback'

  return NextResponse.json({
    success: true,
    mode,
    realTriggered,
    fallbackApplied,
    created: {
      characters: createdCharacters.length,
      locations: createdLocations.length,
    },
    message: 'Demo sample assets requested',
  })
})
