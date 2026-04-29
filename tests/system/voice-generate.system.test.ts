import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { callRoute } from '../integration/api/helpers/call-route'
import { installAuthMocks, mockAuthenticated, resetAuthMockState } from '../helpers/auth'
import { resetSystemState } from '../helpers/db-reset'
import { prisma } from '../helpers/prisma'
import { seedMinimalDomainState } from './helpers/seed'
import { expectLifecycleEvents, listTaskEventTypes, waitForTaskTerminalState } from './helpers/tasks'
import { startSystemWorkers, stopSystemWorkers, type SystemWorkers } from './helpers/workers'

const voiceState = vi.hoisted(() => ({
  audioUrl: 'voice/system-line.wav',
  audioDuration: 1200,
}))

vi.mock('@/lib/user-api/runtime-config', async () => {
  const actual = await vi.importActual<typeof import('@/lib/user-api/runtime-config')>('@/lib/user-api/runtime-config')
  return {
    ...actual,
    resolveModelSelectionOrSingle: vi.fn(async () => ({
      provider: 'fal',
      modelId: 'fal-audio-model',
      modelKey: 'fal::audio-model',
      mediaType: 'audio',
    })),
  }
})

vi.mock('@/lib/voice/generate-voice-line', async () => {
  const actual = await vi.importActual<typeof import('@/lib/voice/generate-voice-line')>('@/lib/voice/generate-voice-line')
  return {
    ...actual,
    generateVoiceLine: vi.fn(async (params: {
      lineId: string
    }) => {
      await prisma.projectVoiceLine.update({
        where: { id: params.lineId },
        data: {
          audioUrl: voiceState.audioUrl,
          audioDuration: voiceState.audioDuration,
        },
      })
      return {
        lineId: params.lineId,
        audioUrl: voiceState.audioUrl,
        storageKey: voiceState.audioUrl,
        audioDuration: voiceState.audioDuration,
      }
    }),
  }
})

describe('system - voice generate', () => {
  let workers: SystemWorkers = {}

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    voiceState.audioUrl = 'voice/system-line.wav'
    voiceState.audioDuration = 1200
    await resetSystemState()
    installAuthMocks()
  })

  afterEach(async () => {
    await stopSystemWorkers(workers)
    workers = {}
    resetAuthMockState()
  })

  it('route -> voice worker -> line audio persisted', async () => {
    const seeded = await seedMinimalDomainState()
    mockAuthenticated(seeded.user.id)
    workers = await startSystemWorkers(['voice'])

    const mod = await import('@/app/api/projects/[projectId]/voice-generate/route')
    const response = await callRoute(
      mod.POST,
      'POST',
      {
        locale: 'zh',
        episodeId: seeded.episode.id,
        lineId: seeded.voiceLine.id,
        audioModel: 'fal::audio-model',
      },
      { params: { projectId: seeded.project.id } },
    )

    expect(response.status).toBe(200)
    const json = await response.json() as { success: boolean; async: boolean; taskId: string }
    expect(json.success).toBe(true)
    const task = await waitForTaskTerminalState(json.taskId)
    expect(task.status).toBe('completed')
    expect(task.type).toBe('voice_line')

    const voiceLine = await prisma.projectVoiceLine.findUnique({
      where: { id: seeded.voiceLine.id },
      select: { audioUrl: true, audioDuration: true },
    })
    expect(voiceLine).toEqual({
      audioUrl: voiceState.audioUrl,
      audioDuration: voiceState.audioDuration,
    })

    const eventTypes = await listTaskEventTypes(json.taskId)
    expectLifecycleEvents(eventTypes, 'completed')
  })
})
