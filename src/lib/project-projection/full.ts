import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { assembleProjectProjectionLite } from '@/lib/project-projection/lite'
import type { ProjectProjectionFull, ProjectProjectionPanelSnapshot } from './types'

function toIso(value: Date): string {
  return value.toISOString()
}

export async function assembleProjectProjectionFull(params: {
  projectId: string
  userId: string
  episodeId?: string | null
  currentStage?: string | null
  selectedScopeRef?: string | null
  panelLimit?: number | null
  scope?: {
    storyboardId?: string | null
    clipId?: string | null
    panelId?: string | null
  } | null
}): Promise<ProjectProjectionFull> {
  const panelLimit = Math.max(1, Math.min(1000, params.panelLimit ?? 300))
  const base = await assembleProjectProjectionLite({
    projectId: params.projectId,
    userId: params.userId,
    episodeId: params.episodeId || null,
    currentStage: params.currentStage || null,
    selectedScopeRef: params.selectedScopeRef || null,
  })

  const episodeId = base.episodeId || null
  if (!episodeId) {
    return {
      ...base,
      workflow: null,
    }
  }

  const scopedStoryboardId = params.scope?.storyboardId || null
  const scopedClipId = params.scope?.clipId || null
  const scopedPanelId = params.scope?.panelId || null

  const filters: Prisma.ProjectPanelWhereInput[] = [
    { storyboard: { episodeId } },
  ]
  if (scopedPanelId) {
    filters.push({ id: scopedPanelId })
  }
  if (scopedStoryboardId) {
    filters.push({ storyboardId: scopedStoryboardId })
  }
  if (scopedClipId) {
    filters.push({ storyboard: { clipId: scopedClipId } })
  }
  const panelWhere: Prisma.ProjectPanelWhereInput = filters.length === 1 ? filters[0] : { AND: filters }

  const [matchingPanelCount, panelRows] = await Promise.all([
    prisma.projectPanel.count({ where: panelWhere }),
    prisma.projectPanel.findMany({
      where: panelWhere,
      orderBy: [
        { storyboardId: 'asc' },
        { panelIndex: 'asc' },
      ],
      take: panelLimit,
      select: {
        id: true,
        storyboardId: true,
        panelIndex: true,
        panelNumber: true,
        shotType: true,
        cameraMove: true,
        description: true,
        location: true,
        characters: true,
        props: true,
        duration: true,
        imagePrompt: true,
        imageUrl: true,
        imageMediaId: true,
        candidateImages: true,
        videoPrompt: true,
        videoUrl: true,
        videoMediaId: true,
        createdAt: true,
        updatedAt: true,
        storyboard: {
          select: {
            clipId: true,
          },
        },
      },
    }),
  ])

  const panels: ProjectProjectionPanelSnapshot[] = []
  for (const panel of panelRows) {
    panels.push({
      panelId: panel.id,
      clipId: panel.storyboard.clipId,
      storyboardId: panel.storyboardId,
      panelIndex: panel.panelIndex,
      panelNumber: panel.panelNumber ?? null,
      shotType: panel.shotType ?? null,
      cameraMove: panel.cameraMove ?? null,
      description: panel.description ?? null,
      location: panel.location ?? null,
      characters: panel.characters ?? null,
      props: panel.props ?? null,
      duration: panel.duration ?? null,
      imagePrompt: panel.imagePrompt ?? null,
      imageUrl: panel.imageUrl ?? null,
      imageMediaId: panel.imageMediaId ?? null,
      candidateImages: panel.candidateImages ?? null,
      videoPrompt: panel.videoPrompt ?? null,
      videoUrl: panel.videoUrl ?? null,
      videoMediaId: panel.videoMediaId ?? null,
      createdAt: toIso(panel.createdAt),
      updatedAt: toIso(panel.updatedAt),
    })
  }

  const storyboardWhere: Prisma.ProjectStoryboardWhereInput | null = scopedPanelId
    ? panelRows.length > 0
      ? { id: panelRows[0]!.storyboardId }
      : null
    : scopedStoryboardId
      ? { id: scopedStoryboardId }
      : scopedClipId
        ? { clipId: scopedClipId }
        : { episodeId }

  const storyboards = storyboardWhere
    ? await prisma.projectStoryboard.findMany({
        where: storyboardWhere,
        select: {
          id: true,
          clipId: true,
        },
      })
    : []

  const clipIds = Array.from(new Set(storyboards.map((storyboard) => storyboard.clipId)))
  const clips = clipIds.length === 0
    ? []
    : await prisma.projectClip.findMany({
        where: { id: { in: clipIds } },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          summary: true,
        },
      })

  const panelCountByStoryboard = storyboards.length === 0
    ? new Map<string, number>()
    : new Map(
        (
          await prisma.projectPanel.groupBy({
            by: ['storyboardId'],
            where: {
              storyboardId: { in: storyboards.map((storyboard) => storyboard.id) },
            },
            _count: { _all: true },
          })
        ).map((row) => [row.storyboardId, row._count._all]),
      )

  const clipSummaryById = new Map(clips.map((clip) => [clip.id, clip.summary]))
  const clipList = storyboards.map((storyboard) => ({
    clipId: storyboard.clipId,
    summary: clipSummaryById.get(storyboard.clipId) || '',
    storyboardId: storyboard.id,
    panelCount: panelCountByStoryboard.get(storyboard.id) || 0,
  }))

  const truncated = matchingPanelCount > panels.length

  return {
    ...base,
    workflow: {
      clips: clipList,
      panels,
      panelLimit,
      totalPanelCount: matchingPanelCount,
      truncated,
    },
  }
}
