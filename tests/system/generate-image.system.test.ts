import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { callRoute } from '../integration/api/helpers/call-route'
import { installAuthMocks, mockAuthenticated, resetAuthMockState } from '../helpers/auth'
import { resetSystemState } from '../helpers/db-reset'
import { prisma } from '../helpers/prisma'
import { seedMinimalDomainState } from './helpers/seed'
import { expectLifecycleEvents, listTaskEventTypes, waitForTaskTerminalState } from './helpers/tasks'
import { startSystemWorkers, stopSystemWorkers, type SystemWorkers } from './helpers/workers'

const imageState = vi.hoisted(() => ({
  mode: 'success' as 'success' | 'fatal',
  cosKey: 'cos/system-image-generated.png',
  errorMessage: 'IMAGE_GENERATION_FATAL',
}))

vi.mock('@/lib/workers/handlers/image-task-handler-shared', async () => {
  const actual = await vi.importActual<typeof import('@/lib/workers/handlers/image-task-handler-shared')>(
    '@/lib/workers/handlers/image-task-handler-shared',
  )
  return {
    ...actual,
    generateProjectLabeledImageToStorage: vi.fn(async () => {
      if (imageState.mode === 'fatal') {
        throw new Error(imageState.errorMessage)
      }
      return imageState.cosKey
    }),
  }
})

vi.mock('@/lib/media/outbound-image', async () => {
  const actual = await vi.importActual<typeof import('@/lib/media/outbound-image')>('@/lib/media/outbound-image')
  return {
    ...actual,
    normalizeReferenceImagesForGeneration: vi.fn(async (refs: string[]) => refs.map((item) => `normalized:${item}`)),
  }
})

describe('system - generate image', () => {
  let workers: SystemWorkers = {}

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    imageState.mode = 'success'
    imageState.cosKey = 'cos/system-image-generated.png'
    imageState.errorMessage = 'IMAGE_GENERATION_FATAL'
    await resetSystemState()
    installAuthMocks()
  })

  afterEach(async () => {
    await stopSystemWorkers(workers)
    workers = {}
    resetAuthMockState()
  })

  it('route -> queue -> worker -> db writes imageUrl and lifecycle events', async () => {
    const seeded = await seedMinimalDomainState()
    mockAuthenticated(seeded.user.id)
    workers = await startSystemWorkers(['image'])

    const mod = await import('@/app/api/projects/[projectId]/generate-image/route')
    const response = await callRoute(
      mod.POST,
      'POST',
      {
        locale: 'zh',
        type: 'character',
        id: seeded.character.id,
        appearanceId: seeded.appearance.id,
        count: 1,
      },
      { params: { projectId: seeded.project.id } },
    )

    expect(response.status).toBe(200)
    const json = await response.json() as { async: boolean; taskId: string }
    expect(json.async).toBe(true)
    expect(typeof json.taskId).toBe('string')

    const task = await waitForTaskTerminalState(json.taskId)
    expect(task.status).toBe('completed')
    expect(task.type).toBe('image_character')
    expect(task.targetId).toBe(seeded.appearance.id)

    const appearance = await prisma.characterAppearance.findUnique({
      where: { id: seeded.appearance.id },
      select: { imageUrl: true, imageUrls: true, selectedIndex: true },
    })
    expect(appearance).toEqual({
      imageUrl: imageState.cosKey,
      imageUrls: JSON.stringify([imageState.cosKey]),
      selectedIndex: 0,
    })

    const eventTypes = await listTaskEventTypes(json.taskId)
    expectLifecycleEvents(eventTypes, 'completed')
  })

  it('fatal provider path -> task fails and existing appearance images stay unchanged', async () => {
    const seeded = await seedMinimalDomainState()
    mockAuthenticated(seeded.user.id)
    imageState.mode = 'fatal'
    imageState.errorMessage = 'IMAGE_GENERATION_FATAL'
    workers = await startSystemWorkers(['image'])

    const originalAppearance = await prisma.characterAppearance.findUnique({
      where: { id: seeded.appearance.id },
      select: { imageUrl: true, imageUrls: true, selectedIndex: true },
    })

    const mod = await import('@/app/api/projects/[projectId]/generate-image/route')
    const response = await callRoute(
      mod.POST,
      'POST',
      {
        locale: 'zh',
        type: 'character',
        id: seeded.character.id,
        appearanceId: seeded.appearance.id,
        count: 1,
      },
      { params: { projectId: seeded.project.id } },
    )

    expect(response.status).toBe(200)
    const json = await response.json() as { taskId: string }
    const task = await waitForTaskTerminalState(json.taskId)
    expect(task.status).toBe('failed')
    expect(task.errorMessage).toContain('IMAGE_GENERATION_FATAL')

    const appearance = await prisma.characterAppearance.findUnique({
      where: { id: seeded.appearance.id },
      select: { imageUrl: true, imageUrls: true, selectedIndex: true },
    })
    expect(appearance).toEqual(originalAppearance)

    const eventTypes = await listTaskEventTypes(json.taskId)
    expectLifecycleEvents(eventTypes, 'failed')
  })
})
