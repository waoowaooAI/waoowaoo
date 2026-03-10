import { beforeEach, describe, expect, it, vi } from 'vitest'
import { trackWorkspaceMangaEvent } from '@/lib/workspace/manga-discovery-analytics'
import { logEvent } from '@/lib/logging/core'

vi.mock('@/lib/logging/core', () => ({
  logEvent: vi.fn(),
}))

describe('manga discovery analytics helper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('emits structured workspace manga discovery event', () => {
    trackWorkspaceMangaEvent('workspace_manga_cta_click', {
      surface: 'workspace_card',
      locale: 'vi',
    })

    expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({
      level: 'INFO',
      module: 'workspace',
      action: 'WORKSPACE_MANGA_DISCOVERY',
      message: 'workspace_manga_cta_click',
      details: expect.objectContaining({
        event: 'workspace_manga_cta_click',
        surface: 'workspace_card',
        locale: 'vi',
      }),
    }))
  })
})
