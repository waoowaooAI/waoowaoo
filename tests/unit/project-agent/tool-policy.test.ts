import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { PROJECT_PHASE, type ProjectPhaseSnapshot } from '@/lib/project-agent/project-phase'
import type { ProjectAgentOperationRegistry } from '@/lib/operations/types'
import type { ProjectAgentRouteDecision } from '@/lib/project-agent/router'
import { selectProjectAgentTools } from '@/lib/project-agent/tool-policy'

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
      actMode: [],
      planMode: [],
    },
  }
}

function buildRoute(partial: Partial<ProjectAgentRouteDecision>): ProjectAgentRouteDecision {
  return {
    intent: 'query',
    domains: ['unknown'],
    confidence: 0.5,
    toolCategories: ['project-overview'],
    needsClarification: false,
    clarifyingQuestion: null,
    reasoning: ['test'],
    latestUserText: 'test',
    ...partial,
  }
}

describe('selectProjectAgentTools', () => {
  it('[query] excludes act tools and episode-required tools when episodeId missing', () => {
    const operations: ProjectAgentOperationRegistry = {
      get_project_phase: {
        id: 'get_project_phase',
        description: 'phase',
        scope: 'project',
        sideEffects: { mode: 'query', risk: 'low' },
        channels: { tool: true, api: true },
        tool: { defaultVisibility: 'core', tags: ['read', 'project'], groups: ['read'], selectable: true },
        selection: { baseWeight: 100, costHint: 'low' },
        inputSchema: z.object({}),
        outputSchema: z.unknown(),
        execute: async () => ({}),
      },
      update_storyboard_photography_plan: {
        id: 'update_storyboard_photography_plan',
        description: 'edit storyboard',
        scope: 'storyboard',
        sideEffects: { mode: 'act', risk: 'low' },
        channels: { tool: true, api: true },
        tool: { defaultVisibility: 'extended', tags: ['storyboard', 'edit'], groups: ['storyboard'], selectable: true },
        selection: { baseWeight: 90, costHint: 'low' },
        inputSchema: z.object({ storyboardId: z.string() }),
        outputSchema: z.unknown(),
        execute: async () => ({}),
      },
      get_panel_detail: {
        id: 'get_panel_detail',
        description: 'panel detail',
        scope: 'panel',
        sideEffects: { mode: 'query', risk: 'low' },
        channels: { tool: true, api: true },
        tool: {
          defaultVisibility: 'extended',
          tags: ['storyboard', 'panel', 'read'],
          groups: ['storyboard', 'panel'],
          selectable: true,
          requiresEpisode: true,
        },
        selection: { baseWeight: 80, costHint: 'low' },
        inputSchema: z.object({}),
        outputSchema: z.unknown(),
        execute: async () => ({}),
      },
    }

    const selection = selectProjectAgentTools({
      operations,
      context: { episodeId: null },
      phase: buildPhaseSnapshot(),
      route: buildRoute({ intent: 'query', domains: ['storyboard'], toolCategories: ['storyboard-read'] }),
      maxTools: 10,
    })

    expect(selection.operationIds).toContain('get_project_phase')
    expect(selection.operationIds).not.toContain('update_storyboard_photography_plan')
    expect(selection.operationIds).not.toContain('get_panel_detail')
  })

  it('[asset_hub_read] prefers asset-hub read tools', () => {
    const operations: ProjectAgentOperationRegistry = {
      asset_hub_picker: {
        id: 'asset_hub_picker',
        description: 'picker',
        scope: 'system',
        sideEffects: { mode: 'query', risk: 'low' },
        channels: { tool: true, api: true },
        tool: { defaultVisibility: 'extended', tags: ['asset-hub', 'read'], groups: ['asset-hub', 'read'], selectable: true },
        selection: { baseWeight: 100, costHint: 'low' },
        inputSchema: z.object({}),
        outputSchema: z.unknown(),
        execute: async () => ({}),
      },
      get_project_phase: {
        id: 'get_project_phase',
        description: 'phase',
        scope: 'project',
        sideEffects: { mode: 'query', risk: 'low' },
        channels: { tool: true, api: true },
        tool: { defaultVisibility: 'core', tags: ['read', 'project'], groups: ['read'], selectable: true },
        selection: { baseWeight: 10, costHint: 'low' },
        inputSchema: z.object({}),
        outputSchema: z.unknown(),
        execute: async () => ({}),
      },
    }

    const selection = selectProjectAgentTools({
      operations,
      context: {},
      phase: buildPhaseSnapshot(),
      route: buildRoute({ intent: 'query', domains: ['asset-hub'], toolCategories: ['asset-hub'] }),
      maxTools: 5,
    })

    expect(selection.operationIds[0]).toBe('asset_hub_picker')
  })

  it('[panel media] keeps likely-needed media tools instead of aggressive exclusion', () => {
    const operations: ProjectAgentOperationRegistry = {
      regenerate_panel_image: {
        id: 'regenerate_panel_image',
        description: 'regenerate panel image',
        scope: 'panel',
        sideEffects: { mode: 'act', risk: 'medium', billable: true },
        channels: { tool: true, api: true },
        tool: { defaultVisibility: 'scenario', tags: ['media', 'panel', 'storyboard'], groups: ['media'], selectable: true },
        selection: { baseWeight: 60, costHint: 'high' },
        inputSchema: z.object({}),
        outputSchema: z.unknown(),
        execute: async () => ({}),
      },
      get_project_phase: {
        id: 'get_project_phase',
        description: 'phase',
        scope: 'project',
        sideEffects: { mode: 'query', risk: 'low' },
        channels: { tool: true, api: true },
        tool: { defaultVisibility: 'core', tags: ['read', 'project'], groups: ['read'], selectable: true },
        selection: { baseWeight: 10, costHint: 'low' },
        inputSchema: z.object({}),
        outputSchema: z.unknown(),
        execute: async () => ({}),
      },
    }

    const selection = selectProjectAgentTools({
      operations,
      context: { episodeId: 'ep-1' },
      phase: buildPhaseSnapshot(),
      route: buildRoute({ intent: 'act', domains: ['storyboard'], toolCategories: ['panel-media'] }),
      maxTools: 5,
    })

    expect(selection.operationIds).toContain('regenerate_panel_image')
  })
})
