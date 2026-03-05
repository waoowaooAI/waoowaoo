import { prisma } from '@/lib/prisma'

type CheckCancelled = () => Promise<void>

export async function generateVoiceLine(params: {
  projectId: string
  episodeId?: string | null
  lineId: string
  userId: string
  audioModel?: string
  checkCancelled?: CheckCancelled
}) {
  const line = await prisma.voiceLine.findUnique({
    where: { id: params.lineId },
    select: {
      id: true,
      episodeId: true,
      speaker: true,
      content: true,
      emotionPrompt: true,
      emotionStrength: true,
      audioUrl: true,
    },
  })

  if (!line) {
    throw new Error('Voice line not found')
  }

  const text = (line.content || '').trim()
  if (!text) {
    throw new Error('Voice line text is empty')
  }

  await params.checkCancelled?.()

  throw new Error('VOICE_GENERATION_PIPELINE_PENDING_REFACTOR')
}

export function estimateVoiceLineMaxSeconds(content: string | null | undefined) {
  const chars = typeof content === 'string' ? content.length : 0
  return Math.max(5, Math.ceil(chars / 2))
}
