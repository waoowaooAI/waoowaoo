import { prisma } from '@/lib/prisma'

type CharacterVoiceRecord = {
  id: string
  customVoiceUrl: string | null
}

type SpeakerVoiceConfig = {
  voiceType?: unknown
  voiceId?: unknown
  audioUrl?: unknown
  [key: string]: unknown
}

type CleanupSummary = {
  projectCharactersUpdated: number
  globalCharactersUpdated: number
  episodeSpeakerVoicesUpdated: number
  episodeSpeakerVoicesCleared: number
  invalidSpeakerVoicesSkipped: number
}

function hasPlayableAudioUrl(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0
}

function normalizeVoiceType(customVoiceUrl: string | null) {
  return hasPlayableAudioUrl(customVoiceUrl) ? 'custom' : null
}

async function cleanupCharacterTable(records: CharacterVoiceRecord[], table: 'project' | 'global') {
  let updated = 0
  for (const row of records) {
    const nextVoiceType = normalizeVoiceType(row.customVoiceUrl)
    if (table === 'project') {
      await prisma.novelPromotionCharacter.update({
        where: { id: row.id },
        data: {
          voiceType: nextVoiceType,
          voiceId: null,
        },
      })
    } else {
      await prisma.globalCharacter.update({
        where: { id: row.id },
        data: {
          voiceType: nextVoiceType,
          voiceId: null,
        },
      })
    }
    updated += 1
  }
  return updated
}

function normalizeSpeakerVoices(payload: string): {
  ok: true
  changed: boolean
  cleared: boolean
  next: string | null
} | {
  ok: false
} {
  let parsed: unknown
  try {
    parsed = JSON.parse(payload)
  } catch {
    return { ok: false }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false }
  }

  const source = parsed as Record<string, unknown>
  const next: Record<string, SpeakerVoiceConfig> = {}
  let changed = false

  for (const [speaker, value] of Object.entries(source)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { ok: false }
    }

    const config = { ...(value as SpeakerVoiceConfig) }
    if (config.voiceType === 'azure') {
      if (hasPlayableAudioUrl(config.audioUrl)) {
        config.voiceType = 'custom'
        config.voiceId = null
        next[speaker] = config
      } else {
        // No usable audio, drop stale azure speaker config.
      }
      changed = true
      continue
    }

    next[speaker] = config
  }

  const keys = Object.keys(next)
  if (keys.length === 0) {
    return {
      ok: true,
      changed,
      cleared: true,
      next: null,
    }
  }

  return {
    ok: true,
    changed,
    cleared: false,
    next: changed ? JSON.stringify(next) : payload,
  }
}

async function main() {
  const summary: CleanupSummary = {
    projectCharactersUpdated: 0,
    globalCharactersUpdated: 0,
    episodeSpeakerVoicesUpdated: 0,
    episodeSpeakerVoicesCleared: 0,
    invalidSpeakerVoicesSkipped: 0,
  }

  const [projectCharacters, globalCharacters] = await Promise.all([
    prisma.novelPromotionCharacter.findMany({
      where: { voiceType: 'azure' },
      select: {
        id: true,
        customVoiceUrl: true,
      },
    }),
    prisma.globalCharacter.findMany({
      where: { voiceType: 'azure' },
      select: {
        id: true,
        customVoiceUrl: true,
      },
    }),
  ])

  summary.projectCharactersUpdated = await cleanupCharacterTable(projectCharacters, 'project')
  summary.globalCharactersUpdated = await cleanupCharacterTable(globalCharacters, 'global')

  const episodes = await prisma.novelPromotionEpisode.findMany({
    where: {
      speakerVoices: { not: null },
    },
    select: {
      id: true,
      speakerVoices: true,
    },
  })

  for (const row of episodes) {
    const speakerVoices = row.speakerVoices
    if (!speakerVoices || !speakerVoices.includes('"voiceType":"azure"')) {
      continue
    }
    const normalized = normalizeSpeakerVoices(speakerVoices)
    if (!normalized.ok) {
      summary.invalidSpeakerVoicesSkipped += 1
      continue
    }
    if (!normalized.changed) {
      continue
    }
    await prisma.novelPromotionEpisode.update({
      where: { id: row.id },
      data: {
        speakerVoices: normalized.next,
      },
    })
    summary.episodeSpeakerVoicesUpdated += 1
    if (normalized.cleared) {
      summary.episodeSpeakerVoicesCleared += 1
    }
  }

  process.stdout.write(`${JSON.stringify({
    ok: true,
    checkedAt: new Date().toISOString(),
    summary,
  }, null, 2)}\n`)
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
