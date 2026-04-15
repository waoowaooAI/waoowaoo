import { beforeEach, describe, expect, it } from 'vitest'
import { callRoute } from '../integration/api/helpers/call-route'
import { installAuthMocks, mockAuthenticated, resetAuthMockState } from '../helpers/auth'
import { resetSystemState } from '../helpers/db-reset'
import { prisma } from '../helpers/prisma'
import { seedMinimalDomainState } from '../system/helpers/seed'

describe('regression - panel variant cross storyboard safety', () => {
  beforeEach(async () => {
    await resetSystemState()
    installAuthMocks()
  })

  it('sourcePanelId from another storyboard -> explicit invalid params and no dirty panel', async () => {
    const seeded = await seedMinimalDomainState()
    mockAuthenticated(seeded.user.id)

    const beforeCount = await prisma.projectPanel.count({
      where: { storyboardId: seeded.storyboard.id },
    })

    const mod = await import('@/app/api/projects/[projectId]/panel-variant/route')
    const response = await callRoute(
      mod.POST,
      'POST',
      {
        locale: 'zh',
        storyboardId: seeded.storyboard.id,
        insertAfterPanelId: seeded.panel.id,
        sourcePanelId: seeded.foreignPanel.id,
        variant: {
          video_prompt: 'variant prompt',
          description: 'variant description',
        },
      },
      { params: { projectId: seeded.project.id } },
    )

    expect(response.status).toBe(400)
    const json = await response.json() as { error?: { code?: string } }
    expect(json.error?.code).toBe('INVALID_PARAMS')

    const afterCount = await prisma.projectPanel.count({
      where: { storyboardId: seeded.storyboard.id },
    })
    expect(afterCount).toBe(beforeCount)

    resetAuthMockState()
  })
})
