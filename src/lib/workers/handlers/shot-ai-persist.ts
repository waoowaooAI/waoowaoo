import { prisma } from '@/lib/prisma'
import { composeModelKey, parseModelKeyStrict } from '@/lib/ai-registry/selection'
import { type LocationAvailableSlot, stringifyLocationAvailableSlots } from '@/lib/location-available-slots'
import { resolveProjectDirectorStyleDoc } from '@/lib/style-preset'

function normalizeModelKey(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = parseModelKeyStrict(trimmed)
  if (!parsed) return null
  return composeModelKey(parsed.provider, parsed.modelId)
}

export async function resolveAnalysisModel(projectId: string, userId: string): Promise<{
  id: string
  analysisModel: string
  directorStyleDoc: string | null
}> {
  const [project, userPreference, directorStyleDoc] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, analysisModel: true, directorStyleDoc: true },
    }),
    prisma.userPreference.findUnique({
      where: { userId },
      select: { analysisModel: true },
    }),
    resolveProjectDirectorStyleDoc({ projectId, userId }),
  ])
  if (!project) throw new Error('Project not found')

  // 优先读项目配置，fallback 到用户全局设置
  const analysisModel =
    normalizeModelKey(project.analysisModel) ??
    normalizeModelKey(userPreference?.analysisModel)
  if (!analysisModel) throw new Error('请先在项目设置中配置分析模型')

  return {
    id: project.id,
    analysisModel,
    directorStyleDoc: directorStyleDoc ? JSON.stringify(directorStyleDoc) : null,
  }
}

export async function requireProjectLocation(locationId: string, projectId: string) {
  const location = await prisma.projectLocation.findFirst({
    where: {
      id: locationId,
      projectId,
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
  availableSlots?: LocationAvailableSlot[]
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
    data: {
      description: params.modifiedDescription,
      ...(params.availableSlots ? { availableSlots: stringifyLocationAvailableSlots(params.availableSlots) } : {}),
    },
  })

  return await prisma.projectLocation.findUnique({
    where: { id: params.locationId },
    include: { images: { orderBy: { imageIndex: 'asc' } } },
  })
}
