import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_STATUS, TASK_TYPE } from '@/lib/task/types'
import { createTask } from '@/lib/task/service'
import { prisma } from '../helpers/prisma'
import { resetBillingState } from '../helpers/db-reset'
import { createTestProject, createTestUser } from '../helpers/billing-fixtures'

const reconcileMock = vi.hoisted(() => ({
  isJobAlive: vi.fn(async () => true),
}))

vi.mock('@/lib/task/reconcile', () => reconcileMock)

describe('regression - task dedupe recovery', () => {
  beforeEach(async () => {
    await resetBillingState()
    vi.clearAllMocks()
    reconcileMock.isJobAlive.mockResolvedValue(true)
  })

  it('replaces locale-less queued task instead of deduping forever', async () => {
    const user = await createTestUser()
    const project = await createTestProject(user.id)
    const stale = await prisma.task.create({
      data: {
        userId: user.id,
        projectId: project.id,
        type: TASK_TYPE.SCRIPT_TO_STORYBOARD_RUN,
        targetType: 'ProjectEpisode',
        targetId: 'episode-regression-1',
        status: TASK_STATUS.QUEUED,
        payload: { episodeId: 'episode-regression-1' },
        dedupeKey: 'script_to_storyboard_run:episode-regression-1',
        queuedAt: new Date(),
      },
    })

    const replacement = await createTask({
      userId: user.id,
      projectId: project.id,
      type: TASK_TYPE.SCRIPT_TO_STORYBOARD_RUN,
      targetType: 'ProjectEpisode',
      targetId: 'episode-regression-1',
      payload: {
        episodeId: 'episode-regression-1',
        meta: { locale: 'zh' },
      },
      dedupeKey: 'script_to_storyboard_run:episode-regression-1',
    })

    expect(replacement.deduped).toBe(false)
    expect(replacement.task.id).not.toBe(stale.id)

    const failedStale = await prisma.task.findUnique({ where: { id: stale.id } })
    expect(failedStale).toMatchObject({
      status: TASK_STATUS.FAILED,
      errorCode: 'TASK_LOCALE_REQUIRED',
      dedupeKey: null,
    })
  })

  it('replaces orphaned queued task when queue job is gone', async () => {
    const user = await createTestUser()
    const project = await createTestProject(user.id)
    const orphan = await prisma.task.create({
      data: {
        userId: user.id,
        projectId: project.id,
        type: TASK_TYPE.VIDEO_PANEL,
        targetType: 'ProjectPanel',
        targetId: 'panel-regression-1',
        status: TASK_STATUS.QUEUED,
        payload: {
          storyboardId: 'storyboard-regression-1',
          panelIndex: 1,
          meta: { locale: 'zh' },
        },
        dedupeKey: 'video_panel:panel-regression-1',
        queuedAt: new Date(),
      },
    })
    reconcileMock.isJobAlive.mockResolvedValue(false)

    const replacement = await createTask({
      userId: user.id,
      projectId: project.id,
      type: TASK_TYPE.VIDEO_PANEL,
      targetType: 'ProjectPanel',
      targetId: 'panel-regression-1',
      payload: {
        storyboardId: 'storyboard-regression-1',
        panelIndex: 1,
        meta: { locale: 'zh' },
      },
      dedupeKey: 'video_panel:panel-regression-1',
    })

    expect(replacement.deduped).toBe(false)
    expect(replacement.task.id).not.toBe(orphan.id)

    const failedOrphan = await prisma.task.findUnique({ where: { id: orphan.id } })
    expect(failedOrphan).toMatchObject({
      status: TASK_STATUS.FAILED,
      errorCode: 'RECONCILE_ORPHAN',
      dedupeKey: null,
    })
  })
})
