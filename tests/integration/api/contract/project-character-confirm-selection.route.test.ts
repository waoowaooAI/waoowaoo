import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const authMock = vi.hoisted(() => ({
  requireProjectAuthLight: vi.fn(async () => ({
    session: { user: { id: 'user-1' } },
  })),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))

const executeProjectAgentOperationFromApiMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/adapters/api/execute-project-agent-operation', () => ({
  executeProjectAgentOperationFromApi: executeProjectAgentOperationFromApiMock,
}))

describe('project character confirm selection route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    executeProjectAgentOperationFromApiMock.mockResolvedValue({ success: true })
  })

  it('passes the draft image index into the confirm operation', async () => {
    const mod = await import('@/app/api/projects/[projectId]/character/confirm-selection/route')
    const req = buildMockRequest({
      path: '/api/projects/project-1/character/confirm-selection',
      method: 'POST',
      body: {
        characterId: 'character-1',
        appearanceId: 'appearance-1',
        imageIndex: 2,
      },
    })

    const res = await mod.POST(req, {
      params: Promise.resolve({ projectId: 'project-1' }),
    })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(authMock.requireProjectAuthLight).toHaveBeenCalledWith('project-1')
    expect(executeProjectAgentOperationFromApiMock).toHaveBeenCalledWith(expect.objectContaining({
      operationId: 'confirm_character_appearance_selection',
      projectId: 'project-1',
      userId: 'user-1',
      input: {
        characterId: 'character-1',
        appearanceId: 'appearance-1',
        selectedIndex: 2,
      },
      source: 'project-ui',
    }))
    expect(body).toEqual({ success: true })
  })
})
