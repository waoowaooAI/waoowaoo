import { ApiError } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { deleteObject } from '@/lib/storage'
import { resolveStorageKeyFromMediaValue } from '@/lib/media/service'

export async function confirmProjectLocationBackedSelection(assetId: string): Promise<{ success: true }> {
  const location = await prisma.projectLocation.findUnique({
    where: { id: assetId },
    include: { images: { orderBy: { imageIndex: 'asc' } } },
  })
  if (!location) {
    throw new ApiError('NOT_FOUND')
  }

  const selectedImage = location.selectedImageId
    ? location.images.find((image) => image.id === location.selectedImageId)
    : location.images.find((image) => image.isSelected)

  if (location.images.length <= 1) {
    const onlyImage = location.images[0] ?? null
    if (onlyImage) {
      await prisma.$transaction(async (tx) => {
        await tx.locationImage.update({
          where: { id: onlyImage.id },
          data: {
            imageIndex: 0,
            isSelected: true,
          },
        })
        await tx.projectLocation.update({
          where: { id: assetId },
          data: { selectedImageId: onlyImage.id },
        })
      })
    }
    return { success: true }
  }

  if (!selectedImage || !selectedImage.imageUrl) {
    throw new ApiError('INVALID_PARAMS')
  }

  const imagesToDelete = location.images.filter((image) => image.id !== selectedImage.id)
  for (const image of imagesToDelete) {
    if (!image.imageUrl) continue
    const storageKey = await resolveStorageKeyFromMediaValue(image.imageUrl)
    if (!storageKey) continue
    try {
      await deleteObject(storageKey)
    } catch {
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.locationImage.deleteMany({
      where: {
        locationId: assetId,
        id: { not: selectedImage.id },
      },
    })
    await tx.locationImage.update({
      where: { id: selectedImage.id },
      data: {
        imageIndex: 0,
        isSelected: true,
      },
    })
    await tx.projectLocation.update({
      where: { id: assetId },
      data: { selectedImageId: selectedImage.id },
    })
  })

  return { success: true }
}
