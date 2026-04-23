import { z } from 'zod'
import { ApiError } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { attachMediaFieldsToGlobalVoice } from '@/lib/media/attach'
import { resolveMediaRefFromLegacyValue } from '@/lib/media/service'
import { generateUniqueKey, uploadObject } from '@/lib/storage'
import type { ProjectAgentOperationRegistryDraft } from '@/lib/operations/types'

type UploadFileLike = {
  name: string
  type: string
  arrayBuffer: () => Promise<ArrayBuffer>
}

const AUDIO_MIME_TYPES: ReadonlySet<string> = new Set<string>([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/ogg',
  'audio/m4a',
  'audio/x-m4a',
  'audio/aac',
  'audio/mp4',
])

const AUDIO_EXTS: ReadonlySet<string> = new Set<string>([
  'mp3',
  'wav',
  'ogg',
  'm4a',
  'aac',
])

const MIME_BY_EXT: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function isFileLike(value: unknown): value is UploadFileLike {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<UploadFileLike>
  return typeof candidate.name === 'string'
    && typeof candidate.type === 'string'
    && typeof candidate.arrayBuffer === 'function'
}

function resolveExtFromFilename(filename: string): string {
  const match = filename.toLowerCase().match(/\.([a-z0-9]+)$/)
  return match?.[1] || ''
}

function resolveContentType(params: { fileType: string; ext: string }): string | undefined {
  const normalizedType = normalizeString(params.fileType)
  if (normalizedType) return normalizedType
  const byExt = MIME_BY_EXT[params.ext]
  return byExt || undefined
}

function isSupportedAudio(params: { fileType: string; filename: string }): boolean {
  const ext = resolveExtFromFilename(params.filename)
  if (ext && AUDIO_EXTS.has(ext)) return true
  const normalized = normalizeString(params.fileType)
  return normalized ? AUDIO_MIME_TYPES.has(normalized) : false
}

export function createAssetHubVoiceUploadOperations(): ProjectAgentOperationRegistryDraft {
  return {
    asset_hub_upload_voice: {
      id: 'asset_hub_upload_voice',
      summary: 'Upload an audio file into the global voice library and create a GlobalVoice record.',
      intent: 'act',
      effects: {
        writes: true,
        billable: false,
        destructive: false,
        overwrite: false,
        bulk: false,
        externalSideEffects: true,
        longRunning: false,
      },
      inputSchema: z.object({}).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, _input) => {
        let formData: FormData
        try {
          formData = await ctx.request.formData()
        } catch {
          throw new ApiError('INVALID_PARAMS', {
            code: 'FORMDATA_PARSE_FAILED',
            message: 'request body must be valid multipart/form-data',
          })
        }

        const file = formData.get('file')
        const name = normalizeString(formData.get('name'))
        const folderIdRaw = normalizeString(formData.get('folderId'))
        const descriptionRaw = normalizeString(formData.get('description'))
        const folderId = folderIdRaw || null
        const description = descriptionRaw || null

        if (!isFileLike(file)) throw new ApiError('INVALID_PARAMS')
        if (!name) throw new ApiError('INVALID_PARAMS')

        if (!isSupportedAudio({ fileType: file.type, filename: file.name })) {
          throw new ApiError('INVALID_PARAMS', {
            code: 'UNSUPPORTED_AUDIO_FILE',
            message: 'file must be an audio type (.mp3/.wav/.ogg/.m4a/.aac)',
          })
        }

        if (folderId) {
          const folder = await prisma.globalAssetFolder.findUnique({
            where: { id: folderId },
            select: { id: true, userId: true },
          })
          if (!folder || folder.userId !== ctx.userId) {
            throw new ApiError('INVALID_PARAMS')
          }
        }

        const ext = resolveExtFromFilename(file.name) || 'mp3'
        const storedExt = AUDIO_EXTS.has(ext) ? ext : 'mp3'

        const buffer = Buffer.from(await file.arrayBuffer())
        const key = generateUniqueKey(`voices/${ctx.userId}/${Date.now()}`, storedExt)
        const contentType = resolveContentType({ fileType: file.type, ext: storedExt })
        const storageKey = await uploadObject(buffer, key, undefined, contentType)

        const customVoiceMedia = await resolveMediaRefFromLegacyValue(storageKey)
        const voice = await prisma.globalVoice.create({
          data: {
            userId: ctx.userId,
            folderId,
            name,
            description,
            voiceId: null,
            voiceType: 'uploaded',
            customVoiceUrl: storageKey,
            customVoiceMediaId: customVoiceMedia?.id || null,
            voicePrompt: null,
            gender: null,
            language: 'zh',
          },
        })

        const withMedia = await attachMediaFieldsToGlobalVoice(voice)
        return {
          success: true,
          voice: withMedia,
        }
      },
    },
  }
}
