import { describe, expect, it } from 'vitest'
import type { ProjectAssistantThreadSnapshot } from '@/lib/project-agent/types'
import {
  buildWorkspaceAssistantThreadLogFileName,
  serializeWorkspaceAssistantThreadLog,
} from '@/lib/project-agent/thread-log'

describe('project assistant thread log', () => {
  it('serializes dialogue, tool calls, and structured data into a readable log', () => {
    const thread: ProjectAssistantThreadSnapshot = {
      id: 'thread-1',
      assistantId: 'workspace-command',
      projectId: 'project-1',
      episodeId: 'episode-1',
      scopeRef: 'episode:episode-1',
      messages: [
        {
          id: 'user-1',
          role: 'user',
          parts: [{ type: 'text', text: '删除第七个分镜' }],
        },
        {
          id: 'assistant-1',
          role: 'assistant',
          parts: [
            { type: 'text', text: '好的，我先确认删除对象。' },
            {
              type: 'tool-delete_storyboard_panel',
              toolCallId: 'tool-call-1',
              state: 'output-available',
              input: { panelNumber: 7, confirmed: false },
              output: { ok: true, operationId: 'delete_storyboard_panel' },
            },
            {
              type: 'data-confirmation-request',
              data: {
                operationId: 'delete_storyboard_panel',
                summary: '删除分镜 7',
              },
            },
          ],
        },
      ],
      createdAt: '2026-04-21T00:00:00.000Z',
      updatedAt: '2026-04-21T00:00:05.000Z',
    }

    const text = serializeWorkspaceAssistantThreadLog({ thread })

    expect(text).toContain('# Workspace Assistant Thread Log')
    expect(text).toContain('## 01 USER')
    expect(text).toContain('删除第七个分镜')
    expect(text).toContain('### Tool delete_storyboard_panel')
    expect(text).toContain('"panelNumber": 7')
    expect(text).toContain('### data-confirmation-request')
    expect(text).toContain('"summary": "删除分镜 7"')
  })

  it('builds a stable download filename from project scope and thread id', () => {
    expect(buildWorkspaceAssistantThreadLogFileName({
      id: 'thread-1',
      assistantId: 'workspace-command',
      projectId: 'project-1',
      episodeId: 'episode-1',
      scopeRef: 'episode:episode-1',
      messages: [],
      createdAt: '2026-04-21T00:00:00.000Z',
      updatedAt: '2026-04-21T00:00:05.000Z',
    })).toBe('workspace-assistant__project-1__episode_episode-1__thread-1.log')
  })
})
