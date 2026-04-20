import { describe, expect, it } from 'vitest'
import type { UIMessage } from 'ai'
import { PROJECT_PHASE, type ProjectPhaseSnapshot } from '@/lib/project-agent/project-phase'
import { routeProjectAgentRequest } from '@/lib/project-agent/router'

function buildPhaseSnapshot(): ProjectPhaseSnapshot {
  return {
    phase: PROJECT_PHASE.STORYBOARD_READY,
    progress: {
      clipCount: 1,
      screenplayClipCount: 1,
      storyboardCount: 1,
      panelCount: 10,
      voiceLineCount: 0,
    },
    activeRuns: [],
    activeRunCount: 0,
    failedItems: [],
    staleArtifacts: [],
    availableActions: {
      actMode: ['regenerate_panel_image'],
      planMode: [],
    },
  }
}

function buildUserMessage(text: string): UIMessage {
  return {
    id: 'm-user-1',
    role: 'user',
    parts: [
      {
        type: 'text',
        text,
      },
    ],
  }
}

describe('routeProjectAgentRequest', () => {
  it('[storyboard stage] character persona query -> routes to project_assets_read', () => {
    const route = routeProjectAgentRequest({
      messages: [buildUserMessage('这个角色的人设是什么？给我总结一下。')],
      phase: buildPhaseSnapshot(),
      context: { episodeId: 'ep-1', currentStage: 'storyboard-edit' },
    })

    expect(route.intent).toBe('query')
    expect(route.domains).toContain('character')
    expect(route.nodeId).toBe('project_assets_read')
  })

  it('[storyboard act] apply persona to panel -> routes to storyboard_edit', () => {
    const route = routeProjectAgentRequest({
      messages: [buildUserMessage('把角色A的人设应用到第12镜并修改镜头描述。')],
      phase: buildPhaseSnapshot(),
      context: { episodeId: 'ep-1', currentStage: 'storyboard-edit' },
    })

    expect(route.intent).toBe('act')
    expect(route.domains).toContain('character')
    expect(route.domains).toContain('panel')
    expect(route.nodeId).toBe('storyboard_edit')
  })

  it('[tool selection edit] request phrased as question -> prefers act intent', () => {
    const route = routeProjectAgentRequest({
      messages: [buildUserMessage('能不能把第12镜的描述改一下？')],
      phase: buildPhaseSnapshot(),
      context: {
        episodeId: 'ep-1',
        currentStage: 'storyboard-edit',
        toolSelection: {
          profile: { mode: 'edit', packs: [], riskBudget: 'allow-medium', optionalTags: [] },
          overrides: { enabledOperationIds: [], disabledOperationIds: [], pinnedOperationIds: [] },
        },
      },
    })

    expect(route.intent).toBe('act')
    expect(route.nodeId).toBe('storyboard_edit')
  })
})
