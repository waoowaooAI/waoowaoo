import { getProviderConfig } from '@/lib/api-config'
import { prisma } from '@/lib/prisma'
import { deleteBailianVoice } from './voice-manage'

export interface BailianVoiceBinding {
  voiceId?: string | null
  voiceType?: string | null
}

interface CleanupReferenceScope {
  userId: string
  excludeProjectId?: string
  excludeNovelCharacterId?: string
  excludeGlobalCharacterId?: string
}

export interface BailianVoiceCleanupResult {
  requestedVoiceIds: string[]
  skippedReferencedVoiceIds: string[]
  deletedVoiceIds: string[]
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function toLowerCase(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function looksLikeBailianVoiceId(voiceId: string): boolean {
  return voiceId.startsWith('qwen-tts-vd-')
}

export function isBailianManagedVoiceBinding(binding: BailianVoiceBinding): boolean {
  const voiceId = readTrimmedString(binding.voiceId)
  if (!voiceId) return false

  const voiceType = toLowerCase(binding.voiceType)
  if (voiceType === 'qwen-designed') return true
  return looksLikeBailianVoiceId(voiceId)
}

export function collectBailianManagedVoiceIds(bindings: BailianVoiceBinding[]): string[] {
  const deduped = new Set<string>()
  for (const binding of bindings) {
    if (!isBailianManagedVoiceBinding(binding)) continue
    const voiceId = readTrimmedString(binding.voiceId)
    if (!voiceId) continue
    deduped.add(voiceId)
  }
  return Array.from(deduped)
}

function parseSpeakerVoiceBindings(raw: string | null | undefined): BailianVoiceBinding[] {
  const source = readTrimmedString(raw)
  if (!source) return []

  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch {
    return []
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return []
  }

  const bindings: BailianVoiceBinding[] = []
  for (const value of Object.values(parsed)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    const node = value as Record<string, unknown>
    bindings.push({
      voiceId: readTrimmedString(node.voiceId) || null,
      voiceType: readTrimmedString(node.voiceType) || null,
    })
  }
  return bindings
}

export async function collectProjectBailianManagedVoiceIds(projectId: string): Promise<string[]> {
  const novelProject = await prisma.novelPromotionProject.findUnique({
    where: { projectId },
    select: {
      characters: {
        select: {
          voiceId: true,
          voiceType: true,
        },
      },
      episodes: {
        select: {
          speakerVoices: true,
        },
      },
    },
  })
  if (!novelProject) return []

  const bindings: BailianVoiceBinding[] = []
  for (const character of novelProject.characters) {
    bindings.push({
      voiceId: character.voiceId,
      voiceType: character.voiceType,
    })
  }
  for (const episode of novelProject.episodes) {
    bindings.push(...parseSpeakerVoiceBindings(episode.speakerVoices))
  }
  return collectBailianManagedVoiceIds(bindings)
}

async function findReferencedVoiceIds(params: {
  voiceIds: string[]
  scope: CleanupReferenceScope
}): Promise<Set<string>> {
  const voiceIds = params.voiceIds
  const scope = params.scope
  const referenced = new Set<string>()

  const novelCharacters = await prisma.novelPromotionCharacter.findMany({
    where: {
      voiceId: { in: voiceIds },
      ...(scope.excludeNovelCharacterId
        ? { id: { not: scope.excludeNovelCharacterId } }
        : {}),
      novelPromotionProject: {
        project: {
          userId: scope.userId,
          ...(scope.excludeProjectId
            ? { id: { not: scope.excludeProjectId } }
            : {}),
        },
      },
    },
    select: { voiceId: true },
  })
  for (const row of novelCharacters) {
    const voiceId = readTrimmedString(row.voiceId)
    if (voiceId) referenced.add(voiceId)
  }

  const globalCharacters = await prisma.globalCharacter.findMany({
    where: {
      userId: scope.userId,
      voiceId: { in: voiceIds },
      ...(scope.excludeGlobalCharacterId
        ? { id: { not: scope.excludeGlobalCharacterId } }
        : {}),
    },
    select: { voiceId: true },
  })
  for (const row of globalCharacters) {
    const voiceId = readTrimmedString(row.voiceId)
    if (voiceId) referenced.add(voiceId)
  }

  const globalVoices = await prisma.globalVoice.findMany({
    where: {
      userId: scope.userId,
      voiceId: { in: voiceIds },
    },
    select: { voiceId: true },
  })
  for (const row of globalVoices) {
    const voiceId = readTrimmedString(row.voiceId)
    if (voiceId) referenced.add(voiceId)
  }

  const episodes = await prisma.novelPromotionEpisode.findMany({
    where: {
      speakerVoices: { not: null },
      novelPromotionProject: {
        project: {
          userId: scope.userId,
          ...(scope.excludeProjectId
            ? { id: { not: scope.excludeProjectId } }
            : {}),
        },
      },
    },
    select: { speakerVoices: true },
  })
  for (const episode of episodes) {
    const bindings = parseSpeakerVoiceBindings(episode.speakerVoices)
    for (const binding of bindings) {
      const voiceId = readTrimmedString(binding.voiceId)
      if (!voiceId) continue
      if (!voiceIds.includes(voiceId)) continue
      if (!isBailianManagedVoiceBinding(binding)) continue
      referenced.add(voiceId)
    }
  }

  return referenced
}

export async function cleanupUnreferencedBailianVoices(params: {
  voiceIds: string[]
  scope: CleanupReferenceScope
}): Promise<BailianVoiceCleanupResult> {
  const dedupedVoiceIds = Array.from(
    new Set(
      params.voiceIds
        .map((item) => readTrimmedString(item))
        .filter((item) => item.length > 0),
    ),
  )
  if (dedupedVoiceIds.length === 0) {
    return {
      requestedVoiceIds: [],
      skippedReferencedVoiceIds: [],
      deletedVoiceIds: [],
    }
  }

  const referenced = await findReferencedVoiceIds({
    voiceIds: dedupedVoiceIds,
    scope: params.scope,
  })

  const toDelete = dedupedVoiceIds.filter((voiceId) => !referenced.has(voiceId))
  if (toDelete.length === 0) {
    return {
      requestedVoiceIds: dedupedVoiceIds,
      skippedReferencedVoiceIds: dedupedVoiceIds,
      deletedVoiceIds: [],
    }
  }

  const { apiKey } = await getProviderConfig(params.scope.userId, 'bailian')
  const deletedVoiceIds: string[] = []
  for (const voiceId of toDelete) {
    try {
      await deleteBailianVoice({ apiKey, voiceId })
      deletedVoiceIds.push(voiceId)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`BAILIAN_VOICE_CLEANUP_FAILED(${voiceId}): ${message}`)
    }
  }

  return {
    requestedVoiceIds: dedupedVoiceIds,
    skippedReferencedVoiceIds: dedupedVoiceIds.filter((voiceId) => referenced.has(voiceId)),
    deletedVoiceIds,
  }
}

