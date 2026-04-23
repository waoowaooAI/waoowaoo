import path from 'node:path'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ApiError } from '@/lib/api-errors'
import { resolveStorageKeyFromMediaValue } from '@/lib/media/service'
import type { ProjectAgentOperationRegistryDraft } from '@/lib/operations/types'

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function sanitizeFilenamePart(value: string): string {
  return value.slice(0, 50).replace(/[\\/:*?"<>|]/g, '_')
}

function normalizeExt(storageKey: string, fallback: string): string {
  const raw = path.extname(storageKey).toLowerCase()
  if (!raw) return fallback
  if (raw === '.jpeg') return 'jpg'
  return raw.replace('.', '')
}

type ImagePanel = {
  panelIndex: number | null
  description: string | null
  imageUrl: string | null
}

type ImageStoryboard = {
  clipId: string
  panels: ImagePanel[]
}

type ImageEpisode = {
  storyboards: ImageStoryboard[]
  clips: Array<{ id: string }>
}

async function loadImageEpisodes(params: { projectId: string; episodeId: string | null }): Promise<ImageEpisode[]> {
  if (params.episodeId) {
    const episode = await prisma.projectEpisode.findFirst({
      where: { id: params.episodeId, projectId: params.projectId },
      include: {
        storyboards: {
          include: {
            panels: {
              orderBy: { panelIndex: 'asc' },
              select: {
                panelIndex: true,
                description: true,
                imageUrl: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        clips: {
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        },
      },
    })
    if (!episode) return []
    return [{
      storyboards: episode.storyboards as unknown as ImageStoryboard[],
      clips: episode.clips,
    }]
  }

  const project = await prisma.project.findFirst({
    where: { id: params.projectId },
    include: {
      episodes: {
        include: {
          storyboards: {
            include: {
              panels: {
                orderBy: { panelIndex: 'asc' },
                select: {
                  panelIndex: true,
                  description: true,
                  imageUrl: true,
                },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
          clips: {
            orderBy: { createdAt: 'asc' },
            select: { id: true },
          },
        },
      },
    },
  })

  return (project?.episodes || []).map((episode) => ({
    storyboards: episode.storyboards as unknown as ImageStoryboard[],
    clips: episode.clips,
  }))
}

export function createDownloadOperations(): ProjectAgentOperationRegistryDraft {
  return {
    list_download_images: {
      id: 'list_download_images',
      summary: 'Build a stable download plan for project images (storage keys + filenames).',
      intent: 'query',
      effects: {
        writes: false,
        billable: false,
        destructive: false,
        overwrite: false,
        bulk: false,
        externalSideEffects: false,
        longRunning: false,
      },
      inputSchema: z.object({
        episodeId: z.string().optional(),
      }).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const episodeId = normalizeString((input as Record<string, unknown>).episodeId) || null
        const episodes = await loadImageEpisodes({ projectId: ctx.projectId, episodeId })
        if (episodes.length === 0) {
          throw new ApiError('NOT_FOUND')
        }

        const storyboards: ImageStoryboard[] = []
        const clips: Array<{ id: string }> = []
        for (const episode of episodes) {
          storyboards.push(...episode.storyboards)
          clips.push(...episode.clips)
        }

        const images: Array<{
          clipIndex: number
          panelIndex: number
          desc: string
          imageValue: string
        }> = []

        for (const storyboard of storyboards) {
          const clipIndex = clips.findIndex((clip) => clip.id === storyboard.clipId)
          for (const panel of storyboard.panels || []) {
            if (!panel.imageUrl) continue
            images.push({
              clipIndex: clipIndex >= 0 ? clipIndex : 999,
              panelIndex: panel.panelIndex || 0,
              desc: sanitizeFilenamePart(panel.description || '镜头'),
              imageValue: panel.imageUrl,
            })
          }
        }

        images.sort((a, b) => {
          if (a.clipIndex !== b.clipIndex) return a.clipIndex - b.clipIndex
          return a.panelIndex - b.panelIndex
        })

        const project = await prisma.project.findUnique({
          where: { id: ctx.projectId },
          select: { name: true },
        })
        if (!project) throw new ApiError('NOT_FOUND')

        const files = []
        for (let i = 0; i < images.length; i += 1) {
          const item = images[i]
          const storageKey = await resolveStorageKeyFromMediaValue(item.imageValue)
          if (!storageKey) {
            throw new ApiError('EXTERNAL_ERROR', {
              code: 'DOWNLOAD_IMAGE_KEY_UNRESOLVABLE',
              message: 'image value must be resolvable to a storage key',
            })
          }

          const ext = normalizeExt(storageKey, 'png')
          const index = i + 1
          files.push({
            index,
            fileName: `${String(index).padStart(3, '0')}_${item.desc}.${ext}`,
            storageKey,
          })
        }

        if (files.length === 0) {
          throw new ApiError('INVALID_PARAMS')
        }

        return {
          projectName: project.name,
          files,
        }
      },
    },

    list_download_voices: {
      id: 'list_download_voices',
      summary: 'Build a stable download plan for project voice lines (storage keys + filenames).',
      intent: 'query',
      effects: {
        writes: false,
        billable: false,
        destructive: false,
        overwrite: false,
        bulk: false,
        externalSideEffects: false,
        longRunning: false,
      },
      inputSchema: z.object({
        episodeId: z.string().optional(),
      }).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const episodeId = normalizeString((input as Record<string, unknown>).episodeId) || null

        const voiceLines = await prisma.projectVoiceLine.findMany({
          where: {
            ...(episodeId ? { episodeId } : {}),
            episode: { projectId: ctx.projectId },
            audioUrl: { not: null },
          },
          orderBy: [{ lineIndex: 'asc' }],
          select: {
            lineIndex: true,
            speaker: true,
            content: true,
            audioUrl: true,
          },
        })

        if (voiceLines.length === 0) {
          throw new ApiError('NOT_FOUND')
        }

        const project = await prisma.project.findUnique({
          where: { id: ctx.projectId },
          select: { name: true },
        })
        if (!project) throw new ApiError('NOT_FOUND')

        const files = []
        for (const line of voiceLines) {
          if (!line.audioUrl) {
            throw new ApiError('EXTERNAL_ERROR', {
              code: 'VOICE_LINE_AUDIO_URL_MISSING',
              message: 'voice line audioUrl is null',
            })
          }

          const storageKey = await resolveStorageKeyFromMediaValue(line.audioUrl)
          if (!storageKey) {
            throw new ApiError('EXTERNAL_ERROR', {
              code: 'DOWNLOAD_VOICE_KEY_UNRESOLVABLE',
              message: 'audioUrl must be resolvable to a storage key',
            })
          }

          const safeSpeaker = sanitizeFilenamePart(line.speaker)
          const safeContent = sanitizeFilenamePart(line.content.slice(0, 15).replace(/\s+/g, '_'))
          const ext = normalizeExt(storageKey, 'mp3') === 'wav' ? 'wav' : 'mp3'

          files.push({
            index: line.lineIndex,
            fileName: `${String(line.lineIndex).padStart(3, '0')}_${safeSpeaker}_${safeContent}.${ext}`,
            storageKey,
          })
        }

        return {
          projectName: project.name,
          files,
        }
      },
    },
  }
}
