import { prisma } from '@/lib/prisma'

export async function resolveAnalysisModel(projectId: string): Promise<{
  id: string
  analysisModel: string
}> {
  const novelData = await prisma.novelPromotionProject.findUnique({
    where: { projectId },
    select: {
      id: true,
      analysisModel: true,
    },
  })
  if (!novelData) throw new Error('Novel promotion project not found')
  if (!novelData.analysisModel) throw new Error('请先在项目设置中配置分析模型')
  return {
    id: novelData.id,
    analysisModel: novelData.analysisModel,
  }
}

export async function requireProjectLocation(locationId: string, projectInternalId: string) {
  const location = await prisma.novelPromotionLocation.findFirst({
    where: {
      id: locationId,
      novelPromotionProjectId: projectInternalId,
    },
    select: {
      id: true,
      name: true,
    },
  })
  if (!location) throw new Error('Location not found')
  return location
}

export async function persistLocationDescription(params: {
  locationId: string
  imageIndex: number
  modifiedDescription: string
}) {
  const locationImage = await prisma.locationImage.findFirst({
    where: {
      locationId: params.locationId,
      imageIndex: params.imageIndex,
    },
    select: {
      id: true,
    },
  })
  if (!locationImage) throw new Error('Location image not found')

  await prisma.locationImage.update({
    where: { id: locationImage.id },
    data: { description: params.modifiedDescription },
  })

  return await prisma.novelPromotionLocation.findUnique({
    where: { id: params.locationId },
    include: { images: { orderBy: { imageIndex: 'asc' } } },
  })
}
