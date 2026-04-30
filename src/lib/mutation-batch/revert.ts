import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { revertAssetRender } from '@/lib/assets/services/asset-actions'

export type MutationRevertResult = {
  ok: true
  reverted: number
} | {
  ok: false
  reverted: number
  error: string
}

async function rollbackCreatedVariantPanel(params: {
  panelId: string
  storyboardId: string
  panelIndex: number
}) {
  await prisma.$transaction(async (tx) => {
    await tx.projectPanel.delete({
      where: { id: params.panelId },
    })

    const maxPanel = await tx.projectPanel.findFirst({
      where: { storyboardId: params.storyboardId },
      orderBy: { panelIndex: 'desc' },
      select: { panelIndex: true },
    })
    const maxPanelIndex = maxPanel?.panelIndex ?? -1
    const offset = maxPanelIndex + 1000

    await tx.projectPanel.updateMany({
      where: {
        storyboardId: params.storyboardId,
        panelIndex: { gt: params.panelIndex },
      },
      data: {
        panelIndex: { increment: offset },
        panelNumber: { increment: offset },
      },
    })

    await tx.projectPanel.updateMany({
      where: {
        storyboardId: params.storyboardId,
        panelIndex: { gt: params.panelIndex + offset },
      },
      data: {
        panelIndex: { decrement: offset + 1 },
        panelNumber: { decrement: offset + 1 },
      },
    })

    const panelCount = await tx.projectPanel.count({
      where: { storyboardId: params.storyboardId },
    })

    await tx.projectStoryboard.update({
      where: { id: params.storyboardId },
      data: { panelCount },
    })
  })
}

async function restoreDeletedPanel(params: {
  panel: Record<string, unknown>
}) {
  const panel = params.panel
  const storyboardId = readString(panel.storyboardId)
  const panelId = readString(panel.id)
  const panelIndex = Number(panel.panelIndex)
  const panelNumberRaw = (panel as Record<string, unknown>).panelNumber
  const panelNumber = panelNumberRaw === null || panelNumberRaw === undefined ? null : Number(panelNumberRaw)
  const restoredPanelNumber = panelNumber === null
    ? null
    : Number.isFinite(panelNumber)
      ? Math.trunc(panelNumber)
      : panelIndex + 1

  if (!storyboardId || !panelId || !Number.isFinite(panelIndex)) {
    throw new Error('MUTATION_PANEL_RESTORE_PAYLOAD_INVALID')
  }

  await prisma.$transaction(async (tx) => {
    const maxPanel = await tx.projectPanel.findFirst({
      where: { storyboardId },
      orderBy: { panelIndex: 'desc' },
      select: { panelIndex: true },
    })
    const maxPanelIndex = maxPanel?.panelIndex ?? -1
    const offset = maxPanelIndex + 1000

    await tx.projectPanel.updateMany({
      where: {
        storyboardId,
        panelIndex: { gte: panelIndex },
      },
      data: {
        panelIndex: { increment: offset },
        panelNumber: { increment: offset },
      },
    })

    await tx.projectPanel.updateMany({
      where: {
        storyboardId,
        panelIndex: { gte: panelIndex + offset },
      },
      data: {
        panelIndex: { decrement: offset - 1 },
        panelNumber: { decrement: offset - 1 },
      },
    })

    await tx.projectPanel.create({
      data: {
        id: panelId,
        storyboardId,
        panelIndex,
        panelNumber: restoredPanelNumber,
        shotType: typeof panel.shotType === 'string' ? panel.shotType : null,
        cameraMove: typeof panel.cameraMove === 'string' ? panel.cameraMove : null,
        description: typeof panel.description === 'string' ? panel.description : null,
        location: typeof panel.location === 'string' ? panel.location : null,
        characters: typeof panel.characters === 'string' ? panel.characters : null,
        props: typeof panel.props === 'string' ? panel.props : null,
        srtSegment: typeof panel.srtSegment === 'string' ? panel.srtSegment : null,
        srtStart: typeof panel.srtStart === 'number' ? panel.srtStart : null,
        srtEnd: typeof panel.srtEnd === 'number' ? panel.srtEnd : null,
        duration: typeof panel.duration === 'number' ? panel.duration : null,
        imagePrompt: typeof panel.imagePrompt === 'string' ? panel.imagePrompt : null,
        imageUrl: typeof panel.imageUrl === 'string' ? panel.imageUrl : null,
        imageMediaId: typeof panel.imageMediaId === 'string' ? panel.imageMediaId : null,
        imageHistory: typeof panel.imageHistory === 'string' ? panel.imageHistory : null,
        videoPrompt: typeof panel.videoPrompt === 'string' ? panel.videoPrompt : null,
        firstLastFramePrompt: typeof panel.firstLastFramePrompt === 'string' ? panel.firstLastFramePrompt : null,
        videoUrl: typeof panel.videoUrl === 'string' ? panel.videoUrl : null,
        videoGenerationMode: typeof panel.videoGenerationMode === 'string' ? panel.videoGenerationMode : null,
        videoMediaId: typeof panel.videoMediaId === 'string' ? panel.videoMediaId : null,
        sceneType: typeof panel.sceneType === 'string' ? panel.sceneType : null,
        candidateImages: typeof panel.candidateImages === 'string' ? panel.candidateImages : null,
        linkedToNextPanel: panel.linkedToNextPanel === true,
        lipSyncTaskId: typeof panel.lipSyncTaskId === 'string' ? panel.lipSyncTaskId : null,
        lipSyncVideoUrl: typeof panel.lipSyncVideoUrl === 'string' ? panel.lipSyncVideoUrl : null,
        lipSyncVideoMediaId: typeof panel.lipSyncVideoMediaId === 'string' ? panel.lipSyncVideoMediaId : null,
        sketchImageUrl: typeof panel.sketchImageUrl === 'string' ? panel.sketchImageUrl : null,
        sketchImageMediaId: typeof panel.sketchImageMediaId === 'string' ? panel.sketchImageMediaId : null,
        photographyRules: typeof panel.photographyRules === 'string' ? panel.photographyRules : null,
        actingNotes: typeof panel.actingNotes === 'string' ? panel.actingNotes : null,
        previousImageUrl: typeof panel.previousImageUrl === 'string' ? panel.previousImageUrl : null,
        previousImageMediaId: typeof panel.previousImageMediaId === 'string' ? panel.previousImageMediaId : null,
      },
    })

    const panelCount = await tx.projectPanel.count({
      where: { storyboardId },
    })

    await tx.projectStoryboard.update({
      where: { id: storyboardId },
      data: { panelCount },
    })
  })
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export async function revertMutationEntry(entry: {
  kind: string
  targetType: string
  targetId: string
  payload: unknown
  projectId: string
  userId: string
}): Promise<void> {
  const payload = asRecord(entry.payload)

  switch (entry.kind) {
    case 'asset_render_revert': {
      const kind = readString(payload.kind)
      const assetId = readString(payload.assetId) || entry.targetId
      const appearanceId = readString(payload.appearanceId)
      if (kind !== 'character' && kind !== 'location') {
        throw new Error('MUTATION_UNSUPPORTED_KIND')
      }
      await revertAssetRender({
        kind,
        assetId,
        body: {
          ...(appearanceId ? { appearanceId } : {}),
        },
        access: {
          scope: 'project',
          userId: entry.userId,
          projectId: entry.projectId,
        },
      })
      return
    }
    case 'panel_candidate_cancel': {
      const panelId = entry.targetId
      await prisma.projectPanel.update({
        where: { id: panelId },
        data: {
          candidateImages: null,
          previousImageUrl: null,
        },
      })
      return
    }
    case 'panel_variant_delete': {
      const storyboardId = readString(payload.storyboardId)
      const panelIndex = Number(payload.panelIndex)
      if (!storyboardId || !Number.isFinite(panelIndex)) {
        throw new Error('MUTATION_VARIANT_PAYLOAD_INVALID')
      }
      await rollbackCreatedVariantPanel({
        panelId: entry.targetId,
        storyboardId,
        panelIndex,
      })
      return
    }
    case 'panel_create_delete': {
      const storyboardId = readString(payload.storyboardId)
      const panelIndex = Number(payload.panelIndex)
      if (!storyboardId || !Number.isFinite(panelIndex)) {
        throw new Error('MUTATION_PANEL_CREATE_PAYLOAD_INVALID')
      }
      await rollbackCreatedVariantPanel({
        panelId: entry.targetId,
        storyboardId,
        panelIndex,
      })
      return
    }
    case 'panel_prompt_restore': {
      const previousVideoPrompt = payload.previousVideoPrompt === null || typeof payload.previousVideoPrompt === 'string'
        ? payload.previousVideoPrompt
        : undefined
      const previousFirstLastFramePrompt = payload.previousFirstLastFramePrompt === null || typeof payload.previousFirstLastFramePrompt === 'string'
        ? payload.previousFirstLastFramePrompt
        : undefined
      const previousImagePrompt = payload.previousImagePrompt === null || typeof payload.previousImagePrompt === 'string'
        ? payload.previousImagePrompt
        : undefined

      await prisma.projectPanel.update({
        where: { id: entry.targetId },
        data: {
          ...(previousVideoPrompt !== undefined ? { videoPrompt: previousVideoPrompt } : {}),
          ...(previousFirstLastFramePrompt !== undefined ? { firstLastFramePrompt: previousFirstLastFramePrompt } : {}),
          ...(previousImagePrompt !== undefined ? { imagePrompt: previousImagePrompt } : {}),
        },
      })
      return
    }
    case 'panel_candidates_restore': {
      const previousCandidateImages = payload.previousCandidateImages === null || typeof payload.previousCandidateImages === 'string'
        ? payload.previousCandidateImages
        : null
      await prisma.projectPanel.update({
        where: { id: entry.targetId },
        data: {
          candidateImages: previousCandidateImages,
        },
      })
      return
    }
    case 'panel_candidate_select_restore': {
      const previousImageUrl = payload.previousImageUrl === null || typeof payload.previousImageUrl === 'string'
        ? payload.previousImageUrl
        : null
      const previousImageHistory = payload.previousImageHistory === null || typeof payload.previousImageHistory === 'string'
        ? payload.previousImageHistory
        : null
      const previousCandidateImages = payload.previousCandidateImages === null || typeof payload.previousCandidateImages === 'string'
        ? payload.previousCandidateImages
        : null
      await prisma.projectPanel.update({
        where: { id: entry.targetId },
        data: {
          imageUrl: previousImageUrl,
          imageHistory: previousImageHistory,
          candidateImages: previousCandidateImages,
        },
      })
      return
    }
    case 'panel_fields_restore': {
      const previous = asRecord(payload.previous)
      const panelNumberRaw = previous.panelNumber
      const panelNumber = panelNumberRaw === null || panelNumberRaw === undefined ? null : Number(panelNumberRaw)

      await prisma.projectPanel.update({
        where: { id: entry.targetId },
        data: {
          panelNumber: Number.isFinite(panelNumber as number) ? panelNumber : null,
          shotType: previous.shotType === null || typeof previous.shotType === 'string' ? previous.shotType : null,
          cameraMove: previous.cameraMove === null || typeof previous.cameraMove === 'string' ? previous.cameraMove : null,
          description: previous.description === null || typeof previous.description === 'string' ? previous.description : null,
          location: previous.location === null || typeof previous.location === 'string' ? previous.location : null,
          characters: previous.characters === null || typeof previous.characters === 'string' ? previous.characters : null,
          props: previous.props === null || typeof previous.props === 'string' ? previous.props : null,
          srtStart: previous.srtStart === null || typeof previous.srtStart === 'number' ? previous.srtStart : null,
          srtEnd: previous.srtEnd === null || typeof previous.srtEnd === 'number' ? previous.srtEnd : null,
          duration: previous.duration === null || typeof previous.duration === 'number' ? previous.duration : null,
          videoPrompt: previous.videoPrompt === null || typeof previous.videoPrompt === 'string' ? previous.videoPrompt : null,
          firstLastFramePrompt: previous.firstLastFramePrompt === null || typeof previous.firstLastFramePrompt === 'string'
            ? previous.firstLastFramePrompt
            : null,
          linkedToNextPanel: previous.linkedToNextPanel === true,
          actingNotes: previous.actingNotes === null || typeof previous.actingNotes === 'string' ? previous.actingNotes : null,
          photographyRules: previous.photographyRules === null || typeof previous.photographyRules === 'string' ? previous.photographyRules : null,
        },
      })
      return
    }
    case 'panel_reorder_restore': {
      const storyboardId = readString(payload.storyboardId)
      const panels = Array.isArray(payload.panels) ? payload.panels : []
      if (!storyboardId || panels.length === 0) {
        throw new Error('MUTATION_REORDER_PAYLOAD_INVALID')
      }

      await prisma.$transaction(async (tx) => {
        for (const panel of panels) {
          const id = readString((panel as Record<string, unknown>).id)
          const panelIndex = Number((panel as Record<string, unknown>).panelIndex)
          if (!id || !Number.isFinite(panelIndex)) continue
          await tx.projectPanel.update({
            where: { id },
            data: { panelIndex: -(panelIndex + 1) },
          })
        }
        for (const panel of panels) {
          const id = readString((panel as Record<string, unknown>).id)
          const panelIndex = Number((panel as Record<string, unknown>).panelIndex)
          const panelNumberRaw = (panel as Record<string, unknown>).panelNumber
          const panelNumber = panelNumberRaw === null || panelNumberRaw === undefined ? null : Number(panelNumberRaw)
          if (!id || !Number.isFinite(panelIndex)) continue
          await tx.projectPanel.update({
            where: { id },
            data: {
              panelIndex,
              panelNumber: Number.isFinite(panelNumber as number) ? panelNumber : null,
            },
          })
        }
      })
      return
    }
    case 'panel_delete_restore': {
      const panel = asRecord(payload.panel)
      await restoreDeletedPanel({ panel })
      return
    }
    case 'insert_panel_undo': {
      const taskId = readString(payload.taskId)
      if (!taskId) {
        throw new Error('MUTATION_INSERT_PANEL_TASK_REQUIRED')
      }
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        select: { status: true, result: true },
      })
      if (!task) {
        throw new Error('MUTATION_TASK_NOT_FOUND')
      }
      if (!task.result || typeof task.result !== 'object' || Array.isArray(task.result)) {
        throw new Error('MUTATION_TASK_RESULT_MISSING')
      }
      const result = task.result as Record<string, unknown>
      const storyboardId = readString(result.storyboardId) || readString(payload.storyboardId) || entry.targetId
      const panelId = readString(result.panelId)
      const panelIndex = Number(result.panelIndex)
      if (!storyboardId || !panelId || !Number.isFinite(panelIndex)) {
        throw new Error('MUTATION_TASK_RESULT_INVALID')
      }
      await rollbackCreatedVariantPanel({
        panelId,
        storyboardId,
        panelIndex,
      })
      return
    }
    case 'voice_line_restore': {
      const previousAudioUrl = payload.previousAudioUrl === null || typeof payload.previousAudioUrl === 'string'
        ? payload.previousAudioUrl
        : null
      await prisma.projectVoiceLine.update({
        where: { id: entry.targetId },
        data: {
          audioUrl: previousAudioUrl,
        },
      })
      return
    }
    case 'panel_video_restore': {
      const previousVideoUrl = payload.previousVideoUrl === null || typeof payload.previousVideoUrl === 'string'
        ? payload.previousVideoUrl
        : null
      const previousLastVideoGenerationOptions =
        payload.previousLastVideoGenerationOptions === null
          ? Prisma.DbNull
          : (typeof payload.previousLastVideoGenerationOptions === 'object' && !Array.isArray(payload.previousLastVideoGenerationOptions))
            ? payload.previousLastVideoGenerationOptions as Prisma.InputJsonObject
            : undefined
      await prisma.projectPanel.update({
        where: { id: entry.targetId },
        data: {
          videoUrl: previousVideoUrl,
          ...(previousLastVideoGenerationOptions !== undefined
            ? { lastVideoGenerationOptions: previousLastVideoGenerationOptions ?? Prisma.DbNull }
            : {}),
        },
      })
      return
    }
    case 'panel_lipsync_restore': {
      const previousLipSyncVideoUrl = payload.previousLipSyncVideoUrl === null || typeof payload.previousLipSyncVideoUrl === 'string'
        ? payload.previousLipSyncVideoUrl
        : null
      await prisma.projectPanel.update({
        where: { id: entry.targetId },
        data: {
          lipSyncVideoUrl: previousLipSyncVideoUrl,
        },
      })
      return
    }
    default:
      throw new Error(`MUTATION_KIND_UNSUPPORTED:${entry.kind}`)
  }
}

export async function revertMutationBatch(params: {
  batchId: string
  projectId: string
  userId: string
}): Promise<MutationRevertResult> {
  const batch = await prisma.mutationBatch.findFirst({
    where: {
      id: params.batchId,
      projectId: params.projectId,
      userId: params.userId,
    },
    include: {
      entries: {
        orderBy: { createdAt: 'desc' },
      },
    },
  })
  if (!batch) {
    return { ok: false, reverted: 0, error: 'MUTATION_BATCH_NOT_FOUND' }
  }

  if (batch.status === 'reverted') {
    return { ok: true, reverted: 0 }
  }

  let reverted = 0
  try {
    for (const entry of batch.entries) {
      await revertMutationEntry({
        kind: entry.kind,
        targetType: entry.targetType,
        targetId: entry.targetId,
        payload: entry.payload,
        projectId: params.projectId,
        userId: params.userId,
      })
      reverted += 1
    }
    await prisma.mutationBatch.update({
      where: { id: batch.id },
      data: { status: 'reverted', revertedAt: new Date(), revertError: null },
    })
    return { ok: true, reverted }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await prisma.mutationBatch.update({
      where: { id: batch.id },
      data: { status: 'failed', revertError: message },
    })
    return { ok: false, reverted, error: message }
  }
}
