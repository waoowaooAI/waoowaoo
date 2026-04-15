import { prisma } from '@/lib/prisma'
import { ApiError } from '@/lib/api-errors'
import { decodeImageUrlsFromDb, encodeImageUrls } from '@/lib/contracts/image-urls-contract'
import { updateImageLabel } from '@/lib/image-label'
import type { AssetKind, AssetScope } from '@/lib/assets/contracts'

type UpdateAssetRenderLabelInput = {
  scope: AssetScope
  kind: Extract<AssetKind, 'character' | 'location' | 'prop'>
  assetId: string
  projectId?: string
  newName: string
}

export function renderLabelText(input: {
  kind: Extract<AssetKind, 'character' | 'location' | 'prop'>
  assetName: string
  variantLabel?: string | null
}): string {
  if (input.kind === 'character') {
    return `${input.assetName} - ${input.variantLabel || '初始形象'}`
  }
  return input.assetName
}

export async function updateAssetRenderLabel(input: UpdateAssetRenderLabelInput) {
  if (input.scope === 'global') {
    throw new ApiError('INVALID_PARAMS', {
      code: 'GLOBAL_ASSET_LABEL_UPDATES_DISABLED',
      message: 'Global asset images no longer support label updates',
    })
  }
  return updateProjectAssetRenderLabel(input)
}

async function updateProjectAssetRenderLabel(input: UpdateAssetRenderLabelInput) {
  if (!input.projectId) {
    throw new Error('projectId is required for project assets')
  }
  if (input.kind === 'character') {
    const character = await prisma.projectCharacter.findUnique({
      where: {
        id: input.assetId,
      },
      include: { appearances: true },
    })
    if (!character) {
      throw new Error('Project character not found')
    }

    await Promise.all(character.appearances.map(async (appearance: {
      id: string
      imageUrls: string | null
      changeReason: string
    }) => {
      const imageUrls = decodeImageUrlsFromDb(appearance.imageUrls, 'characterAppearance.imageUrls')
      const nextImageUrls = await Promise.all(imageUrls.map(async (imageUrl) => updateImageLabel(
        imageUrl,
        renderLabelText({
          kind: 'character',
          assetName: input.newName,
          variantLabel: appearance.changeReason,
        }),
        {
          generateNewKey: true,
          keyPrefix: 'project-asset-label-rename',
        },
      )))
      const firstImageUrl = nextImageUrls[0] ?? null
      await prisma.characterAppearance.update({
        where: { id: appearance.id },
        data: {
          imageUrls: encodeImageUrls(nextImageUrls),
          imageUrl: firstImageUrl,
        },
      })
    }))
    return
  }

  const location = await prisma.projectLocation.findUnique({
    where: {
      id: input.assetId,
    },
    include: { images: true },
  })
  if (!location) {
    throw new Error('Project location not found')
  }
  await Promise.all(location.images.map(async (image: {
    id: string
    imageUrl: string | null
  }) => {
    if (!image.imageUrl) {
      return
    }
    const nextImageUrl = await updateImageLabel(
      image.imageUrl,
      renderLabelText({
        kind: input.kind === 'prop' ? 'prop' : 'location',
        assetName: input.newName,
      }),
      {
        generateNewKey: true,
        keyPrefix: 'project-asset-label-rename',
      },
    )
    await prisma.locationImage.update({
      where: { id: image.id },
      data: { imageUrl: nextImageUrl },
    })
  }))
}
