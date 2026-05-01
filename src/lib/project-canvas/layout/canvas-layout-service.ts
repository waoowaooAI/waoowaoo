import type { ProjectCanvasLayout, ProjectCanvasNodeLayout } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type {
  CanvasNodeLayoutInput,
  CanvasNodeLayoutSnapshot,
  ProjectCanvasLayoutSnapshot,
  UpsertCanvasLayoutInput,
} from '@/lib/project-canvas/layout/canvas-layout-contract'
import { CANVAS_LAYOUT_SCHEMA_VERSION } from '@/lib/project-canvas/layout/canvas-layout-contract'

type ProjectCanvasLayoutWithNodes = ProjectCanvasLayout & {
  nodeLayouts: ProjectCanvasNodeLayout[]
}

export class CanvasLayoutEpisodeMismatchError extends Error {
  constructor() {
    super('canvas layout episode does not belong to project')
    this.name = 'CanvasLayoutEpisodeMismatchError'
  }
}

function mapNodeLayout(row: ProjectCanvasNodeLayout): CanvasNodeLayoutSnapshot {
  return {
    nodeKey: row.nodeKey,
    nodeType: row.nodeType as CanvasNodeLayoutSnapshot['nodeType'],
    targetType: row.targetType as CanvasNodeLayoutSnapshot['targetType'],
    targetId: row.targetId,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    zIndex: row.zIndex,
    locked: row.locked,
    collapsed: row.collapsed,
  }
}

function mapLayout(row: ProjectCanvasLayoutWithNodes): ProjectCanvasLayoutSnapshot {
  return {
    projectId: row.projectId,
    episodeId: row.episodeId,
    schemaVersion: row.schemaVersion,
    viewport: {
      x: row.viewportX,
      y: row.viewportY,
      zoom: row.zoom,
    },
    nodeLayouts: row.nodeLayouts.map(mapNodeLayout),
  }
}

function dedupeNodeLayouts(nodeLayouts: readonly CanvasNodeLayoutInput[]): CanvasNodeLayoutInput[] {
  const byNodeKey = new Map<string, CanvasNodeLayoutInput>()
  for (const nodeLayout of nodeLayouts) {
    byNodeKey.set(nodeLayout.nodeKey, nodeLayout)
  }
  return [...byNodeKey.values()]
}

async function assertEpisodeBelongsToProject(params: {
  readonly projectId: string
  readonly episodeId: string
}) {
  const episode = await prisma.projectEpisode.findFirst({
    where: {
      id: params.episodeId,
      projectId: params.projectId,
    },
    select: { id: true },
  })

  if (!episode) {
    throw new CanvasLayoutEpisodeMismatchError()
  }
}

export async function getProjectCanvasLayout(params: {
  readonly projectId: string
  readonly episodeId: string
}): Promise<ProjectCanvasLayoutSnapshot | null> {
  const row = await prisma.projectCanvasLayout.findUnique({
    where: { projectId_episodeId: params },
    include: {
      nodeLayouts: {
        orderBy: [
          { zIndex: 'asc' },
          { nodeKey: 'asc' },
        ],
      },
    },
  })

  return row ? mapLayout(row) : null
}

export async function upsertProjectCanvasLayout(params: {
  readonly projectId: string
  readonly input: UpsertCanvasLayoutInput
}): Promise<ProjectCanvasLayoutSnapshot> {
  await assertEpisodeBelongsToProject({
    projectId: params.projectId,
    episodeId: params.input.episodeId,
  })

  const nodeLayouts = dedupeNodeLayouts(params.input.nodeLayouts)

  const row = await prisma.$transaction(async (tx) => {
    const layout = await tx.projectCanvasLayout.upsert({
      where: {
        projectId_episodeId: {
          projectId: params.projectId,
          episodeId: params.input.episodeId,
        },
      },
      create: {
        projectId: params.projectId,
        episodeId: params.input.episodeId,
        schemaVersion: CANVAS_LAYOUT_SCHEMA_VERSION,
        viewportX: params.input.viewport.x,
        viewportY: params.input.viewport.y,
        zoom: params.input.viewport.zoom,
      },
      update: {
        schemaVersion: CANVAS_LAYOUT_SCHEMA_VERSION,
        viewportX: params.input.viewport.x,
        viewportY: params.input.viewport.y,
        zoom: params.input.viewport.zoom,
      },
    })

    await tx.projectCanvasNodeLayout.deleteMany({
      where: { layoutId: layout.id },
    })

    if (nodeLayouts.length > 0) {
      await tx.projectCanvasNodeLayout.createMany({
        data: nodeLayouts.map((nodeLayout) => ({
          layoutId: layout.id,
          nodeKey: nodeLayout.nodeKey,
          nodeType: nodeLayout.nodeType,
          targetType: nodeLayout.targetType,
          targetId: nodeLayout.targetId,
          x: nodeLayout.x,
          y: nodeLayout.y,
          width: nodeLayout.width,
          height: nodeLayout.height,
          zIndex: nodeLayout.zIndex,
          locked: nodeLayout.locked,
          collapsed: nodeLayout.collapsed,
        })),
      })
    }

    return await tx.projectCanvasLayout.findUniqueOrThrow({
      where: { id: layout.id },
      include: {
        nodeLayouts: {
          orderBy: [
            { zIndex: 'asc' },
            { nodeKey: 'asc' },
          ],
        },
      },
    })
  })

  return mapLayout(row)
}
