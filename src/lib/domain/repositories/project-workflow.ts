import type { Prisma, PrismaClient } from '@prisma/client'

type PrismaExecutor = PrismaClient | Prisma.TransactionClient

type PanelCreateRow = {
  id: string
  panelIndex: number
  description: string | null
  srtSegment: string | null
  characters: string | null
  props: string | null
}

export function createProjectRepository(db: PrismaExecutor) {
  return {
    async createCharacter(input: {
      projectId: string
      name: string
      aliasesJson: string | null
      introduction: string | null
      profileDataJson: string
    }) {
      return await db.projectCharacter.create({
        data: {
          projectId: input.projectId,
          name: input.name,
          aliases: input.aliasesJson,
          introduction: input.introduction,
          profileData: input.profileDataJson,
          profileConfirmed: false,
        },
        select: {
          id: true,
          name: true,
        },
      })
    },

    async createLocation(input: {
      projectId: string
      name: string
      summary: string | null
      assetKind?: 'location' | 'prop'
    }) {
      return await db.projectLocation.create({
        data: {
          projectId: input.projectId,
          name: input.name,
          summary: input.summary,
          ...(input.assetKind ? { assetKind: input.assetKind } : {}),
        },
        select: {
          id: true,
          name: true,
        },
      })
    },

    async listEpisodeClips(episodeId: string) {
      return await db.projectClip.findMany({
        where: { episodeId },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          updatedAt: true,
          startText: true,
          endText: true,
        },
      })
    },

    async createClip(input: {
      episodeId: string
      startText: string | null
      endText: string | null
      summary: string
      location: string | null
      charactersJson: string | null
      propsJson: string | null
      content: string
    }) {
      return await db.projectClip.create({
        data: {
          episodeId: input.episodeId,
          startText: input.startText,
          endText: input.endText,
          summary: input.summary,
          location: input.location,
          characters: input.charactersJson,
          props: input.propsJson,
          content: input.content,
        },
        select: {
          id: true,
          updatedAt: true,
        },
      })
    },

    async updateClip(input: {
      clipId: string
      startText: string | null
      endText: string | null
      summary: string
      location: string | null
      charactersJson: string | null
      propsJson: string | null
      content: string
    }) {
      return await db.projectClip.update({
        where: { id: input.clipId },
        data: {
          startText: input.startText,
          endText: input.endText,
          summary: input.summary,
          location: input.location,
          characters: input.charactersJson,
          props: input.propsJson,
          content: input.content,
        },
        select: {
          id: true,
          updatedAt: true,
        },
      })
    },

    async deleteClipsByIds(clipIds: string[]) {
      if (clipIds.length === 0) return { count: 0 }
      return await db.projectClip.deleteMany({
        where: {
          id: {
            in: clipIds,
          },
        },
      })
    },

    async findClipByEpisodeBoundary(input: {
      episodeId: string
      startText: string | null
      endText: string | null
    }) {
      return await db.projectClip.findFirst({
        where: {
          episodeId: input.episodeId,
          startText: input.startText,
          endText: input.endText,
        },
        select: {
          id: true,
          updatedAt: true,
        },
      })
    },

    async updateClipScreenplay(input: {
      clipId: string
      screenplayJson: string
    }) {
      return await db.projectClip.update({
        where: { id: input.clipId },
        data: {
          screenplay: input.screenplayJson,
        },
        select: {
          id: true,
          updatedAt: true,
        },
      })
    },

    async upsertStoryboard(input: {
      clipId: string
      episodeId: string
      panelCount: number
    }) {
      return await db.projectStoryboard.upsert({
        where: { clipId: input.clipId },
        create: {
          clipId: input.clipId,
          episodeId: input.episodeId,
          panelCount: input.panelCount,
        },
        update: {
          panelCount: input.panelCount,
          episodeId: input.episodeId,
          lastError: null,
        },
        select: {
          id: true,
          clipId: true,
          updatedAt: true,
        },
      })
    },

    async deletePanelsByStoryboardId(storyboardId: string) {
      return await db.projectPanel.deleteMany({
        where: { storyboardId },
      })
    },

    async createPanel(input: {
      storyboardId: string
      panelIndex: number
      panelNumber: number
      shotType: string | null
      cameraMove: string | null
      description: string | null
      videoPrompt: string | null
      location: string | null
      charactersJson: string | null
      propsJson: string | null
      srtSegment: string | null
      photographyRulesJson: string | null
      actingNotesJson: string | null
      duration: number | null
    }): Promise<PanelCreateRow> {
      return await db.projectPanel.create({
        data: {
          storyboardId: input.storyboardId,
          panelIndex: input.panelIndex,
          panelNumber: input.panelNumber,
          shotType: input.shotType,
          cameraMove: input.cameraMove,
          description: input.description,
          videoPrompt: input.videoPrompt,
          location: input.location,
          characters: input.charactersJson,
          props: input.propsJson,
          srtSegment: input.srtSegment,
          photographyRules: input.photographyRulesJson,
          actingNotes: input.actingNotesJson,
          duration: input.duration,
        },
        select: {
          id: true,
          panelIndex: true,
          description: true,
          srtSegment: true,
          characters: true,
          props: true,
        },
      })
    },

    async upsertVoiceLine(input: {
      episodeId: string
      lineIndex: number
      speaker: string
      content: string
      emotionStrength: number
      matchedPanelId: string | null
      matchedStoryboardId: string | null
      matchedPanelIndex: number | null
    }) {
      return await db.projectVoiceLine.upsert({
        where: {
          episodeId_lineIndex: {
            episodeId: input.episodeId,
            lineIndex: input.lineIndex,
          },
        },
        create: {
          episodeId: input.episodeId,
          lineIndex: input.lineIndex,
          speaker: input.speaker,
          content: input.content,
          emotionStrength: input.emotionStrength,
          matchedPanelId: input.matchedPanelId,
          matchedStoryboardId: input.matchedStoryboardId,
          matchedPanelIndex: input.matchedPanelIndex,
        },
        update: {
          speaker: input.speaker,
          content: input.content,
          emotionStrength: input.emotionStrength,
          matchedPanelId: input.matchedPanelId,
          matchedStoryboardId: input.matchedStoryboardId,
          matchedPanelIndex: input.matchedPanelIndex,
        },
        select: {
          id: true,
        },
      })
    },

    async deleteVoiceLinesForEpisode(episodeId: string) {
      return await db.projectVoiceLine.deleteMany({
        where: { episodeId },
      })
    },

    async deleteVoiceLinesNotIn(input: {
      episodeId: string
      lineIndexes: number[]
    }) {
      return await db.projectVoiceLine.deleteMany({
        where: {
          episodeId: input.episodeId,
          lineIndex: {
            notIn: input.lineIndexes,
          },
        },
      })
    },
  }
}
