import { prisma } from '@/lib/prisma'
import type { ScriptPreviewPartData, StoryboardPreviewPartData } from './types'

export async function loadScriptPreview(params: {
  episodeId: string
}): Promise<ScriptPreviewPartData> {
  const clips = await prisma.projectClip.findMany({
    where: { episodeId: params.episodeId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      summary: true,
      screenplay: true,
    },
    take: 6,
  })

  return {
    workflowId: 'story-to-script',
    episodeId: params.episodeId,
    clips: clips.map((clip) => {
      let sceneCount = 0
      if (clip.screenplay) {
        try {
          const parsed = JSON.parse(clip.screenplay) as { scenes?: unknown[] }
          sceneCount = Array.isArray(parsed.scenes) ? parsed.scenes.length : 0
        } catch {
          sceneCount = 0
        }
      }
      return {
        clipId: clip.id,
        summary: clip.summary,
        sceneCount,
      }
    }),
  }
}

export async function loadStoryboardPreview(params: {
  episodeId: string
}): Promise<StoryboardPreviewPartData> {
  const [storyboards, voiceLineCount] = await Promise.all([
    prisma.projectStoryboard.findMany({
      where: { episodeId: params.episodeId },
      orderBy: { createdAt: 'asc' },
      take: 6,
      select: {
        id: true,
        clipId: true,
        panelCount: true,
        clip: {
          select: {
            summary: true,
          },
        },
        panels: {
          orderBy: { panelIndex: 'asc' },
          take: 3,
          select: {
            description: true,
          },
        },
      },
    }),
    prisma.projectVoiceLine.count({
      where: { episodeId: params.episodeId },
    }),
  ])

  return {
    workflowId: 'script-to-storyboard',
    episodeId: params.episodeId,
    storyboards: storyboards.map((storyboard) => ({
      storyboardId: storyboard.id,
      clipId: storyboard.clipId,
      clipSummary: storyboard.clip.summary,
      panelCount: storyboard.panelCount,
      sampleDescriptions: storyboard.panels
        .map((panel) => panel.description?.trim() || '')
        .filter((description) => description.length > 0),
    })),
    voiceLineCount,
  }
}
