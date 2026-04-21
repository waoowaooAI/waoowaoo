import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const authState = vi.hoisted(() => ({
  authenticated: true,
}))

const apiAdapterMock = vi.hoisted(() => ({
  executeProjectAgentOperationFromApi: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => {
  const unauthorized = () => new Response(
    JSON.stringify({ error: { code: 'UNAUTHORIZED' } }),
    { status: 401, headers: { 'content-type': 'application/json' } },
  )

  return {
    isErrorResponse: (value: unknown) => value instanceof Response,
    requireProjectAuthLight: async (projectId: string) => {
      if (!authState.authenticated) return unauthorized()
      return {
        session: { user: { id: 'user-1' } },
        project: { id: projectId, userId: 'user-1', name: 'Project' },
      }
    },
  }
})

vi.mock('@/lib/adapters/api/execute-project-agent-operation', () => apiAdapterMock)

import {
  DELETE as panelDelete,
  PATCH as panelPatch,
  POST as panelPost,
  PUT as panelPut,
} from '@/app/api/projects/[projectId]/panel/route'
import { POST as insertPanelPost } from '@/app/api/projects/[projectId]/insert-panel/route'
import { POST as panelSelectCandidatePost } from '@/app/api/projects/[projectId]/panel/select-candidate/route'
import { POST as panelLinkPost } from '@/app/api/projects/[projectId]/panel-link/route'

describe('api contract - project panel routes (operation adapter)', () => {
  beforeEach(() => {
    authState.authenticated = true
    vi.clearAllMocks()
  })

  it('POST /api/projects/[projectId]/panel -> uses create_storyboard_panel', async () => {
    apiAdapterMock.executeProjectAgentOperationFromApi.mockResolvedValueOnce({ panel: { id: 'panel-1' } })

    const res = await panelPost(
      buildMockRequest({
        path: '/api/projects/project-1/panel',
        method: 'POST',
        body: { storyboardId: 'storyboard-1', description: 'new panel' },
      }),
      { params: Promise.resolve({ projectId: 'project-1' }) },
    )

    expect(res.status).toBe(200)
    expect(apiAdapterMock.executeProjectAgentOperationFromApi).toHaveBeenCalledWith(expect.objectContaining({
      operationId: 'create_storyboard_panel',
      projectId: 'project-1',
      userId: 'user-1',
      input: expect.objectContaining({ storyboardId: 'storyboard-1', description: 'new panel' }),
    }))
  })

  it('DELETE /api/projects/[projectId]/panel -> uses delete_storyboard_panel', async () => {
    apiAdapterMock.executeProjectAgentOperationFromApi.mockResolvedValueOnce({ success: true })

    const res = await panelDelete(
      buildMockRequest({
        path: '/api/projects/project-1/panel',
        method: 'DELETE',
        query: { panelId: 'panel-1' },
      }),
      { params: Promise.resolve({ projectId: 'project-1' }) },
    )

    expect(res.status).toBe(200)
    expect(apiAdapterMock.executeProjectAgentOperationFromApi).toHaveBeenCalledWith(expect.objectContaining({
      operationId: 'delete_storyboard_panel',
      input: { panelId: 'panel-1' },
    }))
  })

  it('PATCH /api/projects/[projectId]/panel -> uses update_storyboard_panel_prompt', async () => {
    apiAdapterMock.executeProjectAgentOperationFromApi.mockResolvedValueOnce({ success: true })

    const res = await panelPatch(
      buildMockRequest({
        path: '/api/projects/project-1/panel',
        method: 'PATCH',
        body: { panelId: 'panel-1', videoPrompt: 'prompt' },
      }),
      { params: Promise.resolve({ projectId: 'project-1' }) },
    )

    expect(res.status).toBe(200)
    expect(apiAdapterMock.executeProjectAgentOperationFromApi).toHaveBeenCalledWith(expect.objectContaining({
      operationId: 'update_storyboard_panel_prompt',
      input: { panelId: 'panel-1', videoPrompt: 'prompt' },
    }))
  })

  it('PUT /api/projects/[projectId]/panel -> uses update_storyboard_panel_fields', async () => {
    apiAdapterMock.executeProjectAgentOperationFromApi.mockResolvedValueOnce({ success: true })

    const res = await panelPut(
      buildMockRequest({
        path: '/api/projects/project-1/panel',
        method: 'PUT',
        body: { storyboardId: 'storyboard-1', panelIndex: 0, description: 'desc' },
      }),
      { params: Promise.resolve({ projectId: 'project-1' }) },
    )

    expect(res.status).toBe(200)
    expect(apiAdapterMock.executeProjectAgentOperationFromApi).toHaveBeenCalledWith(expect.objectContaining({
      operationId: 'update_storyboard_panel_fields',
      input: expect.objectContaining({ storyboardId: 'storyboard-1', panelIndex: 0, description: 'desc' }),
    }))
  })

  it('POST /api/projects/[projectId]/insert-panel -> uses insert_storyboard_panel', async () => {
    apiAdapterMock.executeProjectAgentOperationFromApi.mockResolvedValueOnce({ success: true, taskId: 'task-1' })

    const res = await insertPanelPost(
      buildMockRequest({
        path: '/api/projects/project-1/insert-panel',
        method: 'POST',
        body: { storyboardId: 'storyboard-1', insertAfterPanelId: 'panel-1', userInput: 'add panel' },
      }),
      { params: Promise.resolve({ projectId: 'project-1' }) },
    )

    expect(res.status).toBe(200)
    expect(apiAdapterMock.executeProjectAgentOperationFromApi).toHaveBeenCalledWith(expect.objectContaining({
      operationId: 'insert_storyboard_panel',
      input: expect.objectContaining({ storyboardId: 'storyboard-1', insertAfterPanelId: 'panel-1', userInput: 'add panel' }),
    }))
  })

  it('POST /api/projects/[projectId]/panel/select-candidate cancel -> uses cancel_storyboard_panel_candidates', async () => {
    apiAdapterMock.executeProjectAgentOperationFromApi.mockResolvedValueOnce({ success: true })

    const res = await panelSelectCandidatePost(
      buildMockRequest({
        path: '/api/projects/project-1/panel/select-candidate',
        method: 'POST',
        body: { panelId: 'panel-1', action: 'cancel' },
      }),
      { params: Promise.resolve({ projectId: 'project-1' }) },
    )

    expect(res.status).toBe(200)
    expect(apiAdapterMock.executeProjectAgentOperationFromApi).toHaveBeenCalledWith(expect.objectContaining({
      operationId: 'cancel_storyboard_panel_candidates',
      input: { panelId: 'panel-1' },
    }))
  })

  it('POST /api/projects/[projectId]/panel/select-candidate select -> uses select_storyboard_panel_candidate', async () => {
    apiAdapterMock.executeProjectAgentOperationFromApi.mockResolvedValueOnce({ success: true, imageUrl: 'https://example.com/image.png' })

    const res = await panelSelectCandidatePost(
      buildMockRequest({
        path: '/api/projects/project-1/panel/select-candidate',
        method: 'POST',
        body: { panelId: 'panel-1', selectedImageUrl: 'https://example.com/source.png' },
      }),
      { params: Promise.resolve({ projectId: 'project-1' }) },
    )

    expect(res.status).toBe(200)
    expect(apiAdapterMock.executeProjectAgentOperationFromApi).toHaveBeenCalledWith(expect.objectContaining({
      operationId: 'select_storyboard_panel_candidate',
      input: { panelId: 'panel-1', selectedImageUrl: 'https://example.com/source.png' },
    }))
  })

  it('POST /api/projects/[projectId]/panel-link -> uses update_storyboard_panel_fields', async () => {
    apiAdapterMock.executeProjectAgentOperationFromApi.mockResolvedValueOnce({ success: true })

    const res = await panelLinkPost(
      buildMockRequest({
        path: '/api/projects/project-1/panel-link',
        method: 'POST',
        body: { storyboardId: 'storyboard-1', panelIndex: 0, linked: true },
      }),
      { params: Promise.resolve({ projectId: 'project-1' }) },
    )

    expect(res.status).toBe(200)
    expect(apiAdapterMock.executeProjectAgentOperationFromApi).toHaveBeenCalledWith(expect.objectContaining({
      operationId: 'update_storyboard_panel_fields',
      input: { storyboardId: 'storyboard-1', panelIndex: 0, linkedToNextPanel: true },
    }))
  })
})
