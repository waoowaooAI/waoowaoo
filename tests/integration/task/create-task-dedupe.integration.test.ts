import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_STATUS, TASK_TYPE } from '@/lib/task/types'
import { createTask } from '@/lib/task/service'
import { prisma } from '../../helpers/prisma'
import { resetBillingState } from '../../helpers/db-reset'
import { createTestProject, createTestUser } from '../../helpers/billing-fixtures'

const reconcileMock = vi.hoisted(() => ({
  isJobAlive: vi.fn(async () => true),
}))

vi.mock('@/lib/task/reconcile', () => reconcileMock)

describe('task service dedupe + orphan recovery', () => {
  beforeEach(async () => {
    await resetBillingState()
    vi.clearAllMocks()
    reconcileMock.isJobAlive.mockResolvedValue(true)
  })

  it('dedupes to an active task when dedupeKey matches and queue job is alive', async () => {
    const user = await createTestUser()
    const project = await createTestProject(user.id)
    const existing = await prisma.task.create({
      data: {
        userId: user.id,
        projectId: project.id,
        type: TASK_TYPE.VOICE_LINE,
        targetType: 'ProjectVoiceLine',
        targetId: 'line-1',
        status: TASK_STATUS.QUEUED,
        payload: {
          episodeId: 'episode-1',
          lineId: 'line-1',
          meta: { locale: 'zh' },
        },
        dedupeKey: 'voice_line:line-1',
        queuedAt: new Date(),
      },
    })

    const result = await createTask({
      userId: user.id,
      projectId: project.id,
      type: TASK_TYPE.VOICE_LINE,
      targetType: 'ProjectVoiceLine',
      targetId: 'line-1',
      payload: {
        episodeId: 'episode-1',
        lineId: 'line-1',
        meta: { locale: 'zh' },
      },
      dedupeKey: 'voice_line:line-1',
    })

    expect(result.deduped).toBe(true)
    expect(result.task.id).toBe(existing.id)
    expect(reconcileMock.isJobAlive).toHaveBeenCalledWith(existing.id)
  })

  it('fails orphaned active task and creates a replacement when queue job is missing', async () => {
    const user = await createTestUser()
    const project = await createTestProject(user.id)
    const existing = await prisma.task.create({
      data: {
        userId: user.id,
        projectId: project.id,
        type: TASK_TYPE.VIDEO_PANEL,
        targetType: 'ProjectPanel',
        targetId: 'panel-1',
        status: TASK_STATUS.QUEUED,
        payload: {
          storyboardId: 'storyboard-1',
          panelIndex: 1,
          meta: { locale: 'zh' },
        },
        dedupeKey: 'video_panel:panel-1',
        queuedAt: new Date(),
      },
    })
    reconcileMock.isJobAlive.mockResolvedValue(false)

    const result = await createTask({
      userId: user.id,
      projectId: project.id,
      type: TASK_TYPE.VIDEO_PANEL,
      targetType: 'ProjectPanel',
      targetId: 'panel-1',
      payload: {
        storyboardId: 'storyboard-1',
        panelIndex: 1,
        meta: { locale: 'zh' },
      },
      dedupeKey: 'video_panel:panel-1',
    })

    expect(result.deduped).toBe(false)
    expect(result.task.id).not.toBe(existing.id)

    const failedExisting = await prisma.task.findUnique({ where: { id: existing.id } })
    expect(failedExisting).toMatchObject({
      status: TASK_STATUS.FAILED,
      errorCode: 'RECONCILE_ORPHAN',
      dedupeKey: null,
    })
  })

  it('fails locale-less active task and replaces it instead of deduping forever', async () => {
    const user = await createTestUser()
    const project = await createTestProject(user.id)
    const existing = await prisma.task.create({
      data: {
        userId: user.id,
        projectId: project.id,
        type: TASK_TYPE.SCRIPT_TO_STORYBOARD_RUN,
        targetType: 'ProjectEpisode',
        targetId: 'episode-1',
        status: TASK_STATUS.QUEUED,
        payload: {
          episodeId: 'episode-1',
        },
        dedupeKey: 'script_to_storyboard_run:episode-1',
        queuedAt: new Date(),
      },
    })

    const result = await createTask({
      userId: user.id,
      projectId: project.id,
      type: TASK_TYPE.SCRIPT_TO_STORYBOARD_RUN,
      targetType: 'ProjectEpisode',
      targetId: 'episode-1',
      payload: {
        episodeId: 'episode-1',
        meta: { locale: 'zh' },
      },
      dedupeKey: 'script_to_storyboard_run:episode-1',
    })

    expect(result.deduped).toBe(false)
    expect(result.task.id).not.toBe(existing.id)

    const failedExisting = await prisma.task.findUnique({ where: { id: existing.id } })
    expect(failedExisting).toMatchObject({
      status: TASK_STATUS.FAILED,
      errorCode: 'TASK_LOCALE_REQUIRED',
      dedupeKey: null,
    })
  })
})
