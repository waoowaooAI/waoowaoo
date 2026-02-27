import { logInfo as _ulogInfo } from '@/lib/logging/core'
import { fal } from '@fal-ai/client'
import { prisma } from '@/lib/prisma'
import { getAudioApiKey, getProviderKey, resolveModelSelectionOrSingle } from '@/lib/api-config'
import { extractCOSKey, getSignedUrl, imageUrlToBase64, toFetchableUrl, uploadToCOS } from '@/lib/cos'
import { resolveStorageKeyFromMediaValue } from '@/lib/media/service'

type CheckCancelled = () => Promise<void>

function getWavDurationFromBuffer(buffer: Buffer): number {
  try {
    const riff = buffer.slice(0, 4).toString('ascii')
    if (riff !== 'RIFF') {
      return Math.round((buffer.length * 8) / 128)
    }

    const byteRate = buffer.readUInt32LE(28)
    let offset = 12
    let dataSize = 0

    while (offset < buffer.length - 8) {
      const chunkId = buffer.slice(offset, offset + 4).toString('ascii')
      const chunkSize = buffer.readUInt32LE(offset + 4)

      if (chunkId === 'data') {
        dataSize = chunkSize
        break
      }

      offset += 8 + chunkSize
    }

    if (dataSize > 0 && byteRate > 0) {
      return Math.round((dataSize / byteRate) * 1000)
    }

    return Math.round((buffer.length * 8) / 128)
  } catch {
    return Math.round((buffer.length * 8) / 128)
  }
}

async function generateVoiceWithIndexTTS2(params: {
  endpoint: string
  referenceAudioUrl: string
  text: string
  emotionPrompt?: string | null
  strength?: number
  falApiKey?: string
}) {
  const strength = typeof params.strength === 'number' ? params.strength : 0.4

  _ulogInfo(`IndexTTS2: Generating with reference audio, strength: ${strength}`)
  if (params.emotionPrompt) {
    _ulogInfo(`IndexTTS2: Using emotion prompt: ${params.emotionPrompt}`)
  }

  if (params.falApiKey) {
    fal.config({ credentials: params.falApiKey })
  }

  const audioDataUrl = params.referenceAudioUrl.startsWith('data:')
    ? params.referenceAudioUrl
    : await imageUrlToBase64(params.referenceAudioUrl)

  const input: {
    audio_url: string
    prompt: string
    should_use_prompt_for_emotion: boolean
    strength: number
    emotion_prompt?: string
  } = {
    audio_url: audioDataUrl,
    prompt: params.text,
    should_use_prompt_for_emotion: true,
    strength,
  }

  if (params.emotionPrompt?.trim()) {
    input.emotion_prompt = params.emotionPrompt.trim()
  }

  const result = await fal.subscribe(params.endpoint, {
    input,
    logs: false,
  })

  const audioUrl = (result as { data?: { audio?: { url?: string } } })?.data?.audio?.url
  if (!audioUrl) {
    throw new Error('No audio URL in response')
  }

  const response = await fetch(toFetchableUrl(audioUrl))
  if (!response.ok) {
    throw new Error(`Audio download failed: ${response.status}`)
  }
  const arrayBuffer = await response.arrayBuffer()
  const audioData = Buffer.from(arrayBuffer)

  return {
    audioData,
    audioDuration: getWavDurationFromBuffer(audioData),
  }
}

function matchCharacterBySpeaker(
  speaker: string,
  characters: Array<{ name: string; customVoiceUrl?: string | null }>
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

  const line = await prisma.novelPromotionVoiceLine.findUnique({
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
    prisma.novelPromotionProject.findUnique({
      where: { projectId: params.projectId },
      include: { characters: true },
    }),
    prisma.novelPromotionEpisode.findUnique({
      where: { id: episodeId },
      select: { speakerVoices: true },
    }),
  ])

  if (!projectData) {
    throw new Error('Novel promotion project not found')
  }

  let speakerVoices: Record<string, { audioUrl?: string | null }> = {}
  if (episode?.speakerVoices) {
    try {
      speakerVoices = JSON.parse(episode.speakerVoices)
    } catch {
      speakerVoices = {}
    }
  }

  const character = matchCharacterBySpeaker(line.speaker, projectData.characters || [])
  const speakerVoice = speakerVoices[line.speaker]
  const referenceAudioUrl = character?.customVoiceUrl || speakerVoice?.audioUrl
  if (!referenceAudioUrl) {
    throw new Error('请先为该发言人设置参考音频')
  }

  const text = (line.content || '').trim()
  if (!text) {
    throw new Error('Voice line text is empty')
  }

  // 将各种格式的 referenceAudioUrl 统一转为可访问的 URL
  // 兼容旧数据中存的 /m/m_xxx 媒体路由格式
  let fullAudioUrl: string
  if (referenceAudioUrl.startsWith('http') || referenceAudioUrl.startsWith('data:')) {
    // http/data: 直接用
    fullAudioUrl = referenceAudioUrl
  } else if (referenceAudioUrl.startsWith('/m/')) {
    // 媒体路由格式：从数据库解析 storageKey → 再 getSignedUrl
    const storageKey = await resolveStorageKeyFromMediaValue(referenceAudioUrl)
    if (!storageKey) {
      throw new Error(`无法解析参考音频路径: ${referenceAudioUrl}`)
    }
    fullAudioUrl = getSignedUrl(storageKey, 3600)
  } else if (referenceAudioUrl.startsWith('/api/files/')) {
    // 本地签名路径：extractCOSKey → getSignedUrl
    const storageKey = extractCOSKey(referenceAudioUrl)
    fullAudioUrl = storageKey ? getSignedUrl(storageKey, 3600) : referenceAudioUrl
  } else {
    // 原始 storageKey（如 voice/xxx.wav）
    fullAudioUrl = getSignedUrl(referenceAudioUrl, 3600)
  }
  const audioSelection = await resolveModelSelectionOrSingle(params.userId, params.audioModel, 'audio')
  const providerKey = getProviderKey(audioSelection.provider).toLowerCase()
  if (providerKey !== 'fal') {
    throw new Error(`AUDIO_PROVIDER_UNSUPPORTED: ${audioSelection.provider}`)
  }
  const falApiKey = await getAudioApiKey(params.userId, audioSelection.modelKey)

  const generated = await generateVoiceWithIndexTTS2({
    endpoint: audioSelection.modelId,
    referenceAudioUrl: fullAudioUrl,
    text,
    emotionPrompt: line.emotionPrompt,
    strength: line.emotionStrength ?? 0.4,
    falApiKey,
  })

  const audioKey = `voice/${params.projectId}/${episodeId}/${line.id}.wav`
  const cosKey = await uploadToCOS(generated.audioData, audioKey)

  await checkCancelled?.()

  await prisma.novelPromotionVoiceLine.update({
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
