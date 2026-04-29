import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { callRoute } from '../integration/api/helpers/call-route'
import { installAuthMocks, mockAuthenticated, resetAuthMockState } from '../helpers/auth'
import { resetSystemState } from '../helpers/db-reset'
import { prisma } from '../helpers/prisma'
import { seedMinimalDomainState } from './helpers/seed'
import { expectLifecycleEvents, listTaskEventTypes, waitForTaskTerminalState } from './helpers/tasks'
import { startSystemWorkers, stopSystemWorkers, type SystemWorkers } from './helpers/workers'
import { createFixtureEpisode, createFixtureNovelProject, createFixtureProject, createFixtureUser } from '../helpers/fixtures'

type FakeAiResult = {
  text: string
  reasoning?: string
}

type FakeVoiceLineRow = {
  lineIndex: number
  speaker: string
  content: string
  emotionStrength: number
  matchedPanel: {
    storyboardId: string
    panelIndex: number
  }
}

const textState = vi.hoisted(() => ({
  aiResults: [] as FakeAiResult[],
  voiceLineResults: [] as FakeVoiceLineRow[],
  parseFailureCount: 0,
  orchestratorClipId: 'clip-seed',
}))

vi.mock('@/lib/ai-exec/engine', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ai-exec/engine')>('@/lib/ai-exec/engine')
  return {
    ...actual,
    executeAiTextStep: vi.fn(async () => {
      const next = textState.aiResults.shift()
      if (!next) {
        return {
          text: '{"ok":true}',
          reasoning: '',
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          completion: { usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } },
        }
      }
      return {
        text: next.text,
        reasoning: next.reasoning || '',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        completion: { usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } },
      }
    }),
  }
})

vi.mock('@/lib/skill-system/executors/script-to-storyboard/preset', () => {
  return {
    runScriptToStoryboardSkillWorkflow: vi.fn(async () => ({
      clipPanels: [
        {
          clipId: textState.orchestratorClipId,
          clipIndex: 0,
          finalPanels: [
            {
              panel_number: 1,
              shot_type: 'close-up',
              camera_move: 'static',
              description: 'system generated panel',
              video_prompt: 'system video prompt',
              location: 'Office',
              characters: ['Narrator'],
            },
          ],
        },
      ],
      phase1PanelsByClipId: {},
      phase2CinematographyByClipId: {},
      phase2ActingByClipId: {},
      phase3PanelsByClipId: {},
      summary: {
        totalPanelCount: 1,
        totalStepCount: 4,
      },
      voiceLineRows: textState.voiceLineResults,
    })),
  }
})

vi.mock('@/lib/workers/handlers/script-to-storyboard-helpers', async () => {
  const actual = await vi.importActual<typeof import('@/lib/workers/handlers/script-to-storyboard-helpers')>(
    '@/lib/workers/handlers/script-to-storyboard-helpers',
  )
  return {
    ...actual,
    parseVoiceLinesJson: vi.fn(() => {
      if (textState.parseFailureCount > 0) {
        textState.parseFailureCount -= 1
        throw new Error('invalid voice json')
      }
      return textState.voiceLineResults
    }),
    persistStoryboardsAndPanels: vi.fn(async (input: { episodeId: string }) => {
      const clip = await prisma.projectClip.findFirst({
        where: { episodeId: input.episodeId },
        orderBy: { createdAt: 'asc' },
      })
      if (!clip) {
        throw new Error(`TEST_CLIP_NOT_FOUND: ${input.episodeId}`)
      }
      const storyboard = await prisma.projectStoryboard.create({
        data: {
          id: 'storyboard-1',
          episodeId: input.episodeId,
          clipId: clip.id,
          panelCount: 1,
        },
      })
      const panel = await prisma.projectPanel.create({
        data: {
          id: 'panel-1',
          storyboardId: storyboard.id,
          panelIndex: 1,
          panelNumber: 1,
          shotType: 'close-up',
          cameraMove: 'static',
          description: 'system generated panel',
          videoPrompt: 'system video prompt',
          location: 'Office',
          characters: JSON.stringify(['Narrator']),
        },
      })
      return [{ storyboardId: storyboard.id, panels: [{ id: panel.id, panelIndex: 1 }] }]
    }),
  }
})

vi.mock('@/lib/llm-observe/internal-stream-context', () => ({
  getInternalLLMStreamCallbacks: vi.fn(() => null),
  withInternalLLMStreamCallbacks: vi.fn(async (_callbacks: unknown, fn: () => Promise<unknown>) => await fn()),
}))

vi.mock('@/lib/workers/handlers/llm-stream', () => ({
  createWorkerLLMStreamContext: vi.fn(() => ({ streamRunId: 'run-1', nextSeqByStepLane: {} })),
  createWorkerLLMStreamCallbacks: vi.fn(() => ({
    onStage: vi.fn(),
    onChunk: vi.fn(),
    onComplete: vi.fn(),
    onError: vi.fn(),
    flush: vi.fn(async () => undefined),
  })),
}))

async function seedScriptToStoryboardState() {
  const user = await createFixtureUser()
  const project = await createFixtureProject(user.id)
  const novelProject = await createFixtureNovelProject(project.id)
  const episode = await createFixtureEpisode(novelProject.id)
  const clip = await prisma.projectClip.create({
    data: {
      episodeId: episode.id,
      summary: 'script clip',
      content: 'clip content',
      screenplay: 'screenplay text',
      location: 'Office',
      characters: JSON.stringify(['Narrator']),
    },
  })
  await prisma.projectCharacter.create({
    data: {
      projectId: project.id,
      name: 'Narrator',
    },
  })
  await prisma.projectLocation.create({
    data: {
      projectId: project.id,
      name: 'Office',
      summary: 'Office',
    },
  })
  textState.orchestratorClipId = clip.id
  return { user, project, novelProject, episode, clip }
}

describe('system - text workflows', () => {
  let workers: SystemWorkers = {}

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    textState.aiResults = []
    textState.voiceLineResults = []
    textState.parseFailureCount = 0
    textState.orchestratorClipId = 'clip-seed'
    await resetSystemState()
    installAuthMocks()
  })

  afterEach(async () => {
    await stopSystemWorkers(workers)
    workers = {}
    resetAuthMockState()
  })

  it('script-to-storyboard success -> persists storyboard/panel/voiceLine and completes task', async () => {
    const seeded = await seedScriptToStoryboardState()
    mockAuthenticated(seeded.user.id)
    textState.aiResults = [{ text: 'voice-lines-json' }]
    textState.voiceLineResults = [
      {
        lineIndex: 1,
        speaker: 'Narrator',
        content: 'Hello world',
        emotionStrength: 0.8,
        matchedPanel: {
          storyboardId: seeded.clip.id,
          panelIndex: 0,
        },
      },
    ]
    workers = await startSystemWorkers(['text'])

    const mod = await import('@/app/api/projects/[projectId]/script-to-storyboard-stream/route')
    const response = await callRoute(
      mod.POST,
      'POST',
      { locale: 'zh', episodeId: seeded.episode.id },
      { params: { projectId: seeded.project.id } },
    )

    expect(response.status).toBe(200)
    const json = await response.json() as { taskId: string }
    const task = await waitForTaskTerminalState(json.taskId, { timeoutMs: 20_000 })
    expect(task.status).toBe('completed')
    expect(task.type).toBe('script_to_storyboard_run')
    expect(task.result).toEqual(expect.objectContaining({
      episodeId: seeded.episode.id,
      panelCount: 1,
      voiceLineCount: 1,
    }))

    const storyboards = await prisma.projectStoryboard.findMany({
      where: { episodeId: seeded.episode.id },
      select: { id: true, panelCount: true },
    })
    expect(storyboards.length).toBeGreaterThan(0)

    const persistedVoiceLines = await prisma.projectVoiceLine.findMany({
      where: { episodeId: seeded.episode.id },
      orderBy: { lineIndex: 'asc' },
      select: {
        lineIndex: true,
        speaker: true,
        content: true,
        matchedPanelId: true,
        matchedPanelIndex: true,
      },
    })
    expect(persistedVoiceLines).toEqual([
      {
        lineIndex: 1,
        speaker: 'Narrator',
        content: 'Hello world',
        matchedPanelId: expect.any(String),
        matchedPanelIndex: 0,
      },
    ])

    const eventTypes = await listTaskEventTypes(json.taskId)
    expectLifecycleEvents(eventTypes, 'completed')
  })

  it('script-to-storyboard parse retry -> second attempt succeeds', async () => {
    const seeded = await seedScriptToStoryboardState()
    mockAuthenticated(seeded.user.id)
    textState.aiResults = [
      { text: 'invalid-voice-json' },
      { text: 'valid-voice-json' },
    ]
    textState.voiceLineResults = [
      {
        lineIndex: 1,
        speaker: 'Narrator',
        content: 'Retry success',
        emotionStrength: 0.4,
        matchedPanel: {
          storyboardId: seeded.clip.id,
          panelIndex: 0,
        },
      },
    ]
    textState.parseFailureCount = 1
    workers = await startSystemWorkers(['text'])

    const mod = await import('@/app/api/projects/[projectId]/script-to-storyboard-stream/route')
    const response = await callRoute(
      mod.POST,
      'POST',
      { locale: 'zh', episodeId: seeded.episode.id },
      { params: { projectId: seeded.project.id } },
    )

    const json = await response.json() as { taskId: string }
    const task = await waitForTaskTerminalState(json.taskId, { timeoutMs: 20_000 })
    expect(task.status).toBe('completed')
    expect(task.result).toEqual(expect.objectContaining({
      voiceLineCount: 1,
    }))

    const voiceLines = await prisma.projectVoiceLine.findMany({
      where: { episodeId: seeded.episode.id },
      select: { content: true },
    })
    expect(voiceLines).toEqual([{ content: 'Retry success' }])
  })

  it('insert-panel invalid ai payload -> task fails and no dirty panel remains', async () => {
    const seeded = await seedMinimalDomainState()
    mockAuthenticated(seeded.user.id)
    textState.aiResults = [{ text: 'not-json' }]
    workers = await startSystemWorkers(['text'])

    const beforeCount = await prisma.projectPanel.count({
      where: { storyboardId: seeded.storyboard.id },
    })

    const mod = await import('@/app/api/projects/[projectId]/insert-panel/route')
    const response = await callRoute(
      mod.POST,
      'POST',
      {
        locale: 'zh',
        storyboardId: seeded.storyboard.id,
        insertAfterPanelId: seeded.panel.id,
      },
      { params: { projectId: seeded.project.id } },
    )

    expect(response.status).toBe(200)
    const json = await response.json() as { taskId: string }
    const task = await waitForTaskTerminalState(json.taskId, { timeoutMs: 20_000 })
    expect(task.status).toBe('failed')

    const afterCount = await prisma.projectPanel.count({
      where: { storyboardId: seeded.storyboard.id },
    })
    expect(afterCount).toBe(beforeCount)

    const eventTypes = await listTaskEventTypes(json.taskId)
    expectLifecycleEvents(eventTypes, 'failed')
  })
})
