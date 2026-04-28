import { prisma } from '@/lib/prisma'
import { resolveModelSelectionOrSingle } from '@/lib/user-api/runtime-config'
import { executeVoiceLineGeneration } from '@/lib/ai-exec/engine'
import { parseSpeakerVoiceMap, resolveAiProviderAdapter } from '@/lib/ai-providers'
import { getSignedUrl, uploadObject } from '@/lib/storage'
import type { CharacterVoiceFields, SpeakerVoiceMap } from '@/lib/ai-providers/shared/voice-line-binding'

type CheckCancelled = () => Promise<void>
type CharacterVoiceProfile = CharacterVoiceFields & { name: string }

function matchCharacterBySpeaker(
  speaker: string,
  characters: CharacterVoiceProfile[],
) {
  const exactMatch = characters.find((character) => character.name === speaker)
  if (exactMatch) return exactMatch
  return characters.find((character) => character.name.includes(speaker) || speaker.includes(character.name))
}

export async function generateVoiceLine(params: {
  projectId: string
  episodeId?: string | null
  lineId: string
  userId: string
  audioModel?: string
  checkCancelled?: CheckCancelled
}) {
  const checkCancelled = params.checkCancelled

  const line = await prisma.projectVoiceLine.findUnique({
    where: { id: params.lineId },
    select: {
      id: true,
      episodeId: true,
      speaker: true,
      content: true,
      emotionPrompt: true,
      emotionStrength: true,
    },
  })
  if (!line) {
    throw new Error('Voice line not found')
  }

  const episodeId = params.episodeId || line.episodeId
  if (!episodeId) {
    throw new Error('episodeId is required')
  }

  const [projectData, episode] = await Promise.all([
    prisma.project.findUnique({
      where: { id: params.projectId },
      include: { characters: true },
    }),
    prisma.projectEpisode.findUnique({
      where: { id: episodeId },
      select: { speakerVoices: true },
    }),
  ])

  if (!projectData) {
    throw new Error('Project not found')
  }

  const speakerVoices: SpeakerVoiceMap = parseSpeakerVoiceMap(episode?.speakerVoices)

  const character = matchCharacterBySpeaker(line.speaker, projectData.characters || [])
  const speakerVoice = speakerVoices[line.speaker]

  const text = (line.content || '').trim()
  if (!text) {
    throw new Error('Voice line text is empty')
  }

  const audioSelection = await resolveModelSelectionOrSingle(params.userId, params.audioModel, 'audio')
  const voiceLineProvider = resolveAiProviderAdapter(audioSelection.provider).voiceLine
  if (!voiceLineProvider) {
    throw new Error(`AUDIO_PROVIDER_UNSUPPORTED: ${audioSelection.provider}`)
  }
  const voiceBinding = voiceLineProvider.resolveBinding({
    character,
    speakerVoice,
  })
  if (!voiceBinding) {
    throw voiceLineProvider.createMissingBindingError({ character, speakerVoice })
  }

  const generated = await executeVoiceLineGeneration({
    userId: params.userId,
    selection: audioSelection,
    text,
    emotionPrompt: line.emotionPrompt,
    emotionStrength: line.emotionStrength,
    binding: voiceBinding,
  })

  const audioKey = `voice/${params.projectId}/${episodeId}/${line.id}.wav`
  const cosKey = await uploadObject(generated.audioData, audioKey)

  await checkCancelled?.()

  await prisma.projectVoiceLine.update({
    where: { id: line.id },
    data: {
      audioUrl: cosKey,
      audioDuration: generated.audioDuration || null,
    },
  })

  const signedUrl = getSignedUrl(cosKey, 7200)
  return {
    lineId: line.id,
    audioUrl: signedUrl,
    storageKey: cosKey,
    audioDuration: generated.audioDuration || null,
  }
}

export function estimateVoiceLineMaxSeconds(content: string | null | undefined) {
  const chars = typeof content === 'string' ? content.length : 0
  return Math.max(5, Math.ceil(chars / 2))
}
