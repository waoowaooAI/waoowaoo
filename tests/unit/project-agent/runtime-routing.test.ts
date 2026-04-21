import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { NextRequest } from 'next/server'
import type { ProjectAgentOperationRegistry } from '@/lib/operations/types'
import type { ProjectAgentRouteDecision } from '@/lib/project-agent/router'

const streamState = vi.hoisted(() => ({
  capturedToolNames: [] as string[],
  capturedSystem: '',
  routeResult: {
    intent: 'query' as const,
    domains: ['asset'] as const,
    toolCategories: ['asset-character'] as const,
    confidence: 0.92,
    needsClarification: false,
    clarifyingQuestion: null as string | null,
    reasoning: ['route to character asset tools'],
    latestUserText: 'show character info',
  } as ProjectAgentRouteDecision,
  writerEvents: [] as Array<Record<string, unknown>>,
}))

const registryState = vi.hoisted(() => ({
  registry: {} as ProjectAgentOperationRegistry,
}))

const loggerState = vi.hoisted(() => ({
  info: vi.fn(),
}))

vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai')
  return {
    ...actual,
    safeValidateUIMessages: vi.fn(async ({ messages }) => ({ success: true, data: messages })),
    convertToModelMessages: vi.fn(async (messages) => messages),
    tool: vi.fn((definition) => definition),
    streamText: vi.fn((input) => {
      streamState.capturedToolNames = Object.keys(input.tools ?? {})
      streamState.capturedSystem = input.system
      return {
        toUIMessageStream: () => ({
          pipeThrough: () => undefined,
        }),
      }
    }),
    createUIMessageStream: vi.fn(({ execute }) => {
      const writer = {
        write: (chunk: Record<string, unknown>) => {
          streamState.writerEvents.push(chunk)
        },
        merge: vi.fn(),
      }
      void execute({ writer })
      return { writer }
    }),
    createUIMessageStreamResponse: vi.fn(() => new Response('ok', { status: 200 })),
  }
})

vi.mock('@/lib/config-service', () => ({
  getUserModelConfig: vi.fn(async () => ({ analysisModel: 'llm::mock' })),
}))

vi.mock('@/lib/project-agent/model', () => ({
  resolveProjectAgentLanguageModel: vi.fn(async () => ({ languageModel: {} as never })),
}))

vi.mock('@/lib/project-agent/message-compression', () => ({
  compressMessages: vi.fn(async ({ messages }) => messages),
}))

vi.mock('@/lib/project-agent/project-phase', () => ({
  resolveProjectPhase: vi.fn(async () => ({
    phase: 'storyboard_ready',
    progress: {
      clipCount: 1,
      screenplayClipCount: 1,
      storyboardCount: 1,
      panelCount: 1,
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
  })),
}))

vi.mock('@/lib/project-agent/router', () => ({
  routeProjectAgentRequest: vi.fn(async () => streamState.routeResult),
}))

vi.mock('@/lib/project-agent/stop-conditions', () => ({
  createProjectAgentStopController: vi.fn(() => ({
    stopWhen: undefined,
    buildStopPart: () => null,
  })),
}))

vi.mock('@/lib/adapters/tools/execute-project-agent-operation', () => ({
  executeProjectAgentOperationFromTool: vi.fn(async () => ({ ok: true, data: {} })),
}))

vi.mock('@/lib/operations/registry', () => ({
  createProjectAgentOperationRegistry: () => registryState.registry,
}))

vi.mock('@/lib/logging/core', () => ({
  createScopedLogger: vi.fn(() => ({
    info: (...args: unknown[]) => loggerState.info(...args),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    event: vi.fn(),
    child: vi.fn(),
  })),
}))

vi.mock('@/lib/api-errors', () => ({
  getRequestId: vi.fn(() => 'req-1'),
}))

import { createProjectAgentChatResponse } from '@/lib/project-agent/runtime'

function buildRequest(): NextRequest {
  return new Request('http://localhost') as unknown as NextRequest
}

async function flushAsyncWork() {
  await Promise.resolve()
  await Promise.resolve()
}

describe('project agent runtime tool routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    streamState.capturedToolNames = []
    streamState.capturedSystem = ''
    streamState.writerEvents = []
    loggerState.info.mockReset()
    registryState.registry = {
      get_character_detail: {
        id: 'get_character_detail',
        description: 'Get character detail',
        scope: 'asset',
        sideEffects: { mode: 'query', risk: 'low' },
        channels: { tool: true, api: true },
        tool: { selectable: true, defaultVisibility: 'core', tags: ['asset', 'read'], groups: ['asset', 'character'] },
        selection: { baseWeight: 50, costHint: 'low' },
        inputSchema: z.object({}),
        outputSchema: z.unknown(),
        execute: async () => ({}),
      },
      regenerate_panel_image: {
        id: 'regenerate_panel_image',
        description: 'Regenerate panel image',
        scope: 'panel',
        sideEffects: { mode: 'act', risk: 'medium', billable: true },
        channels: { tool: true, api: true },
        tool: { selectable: true, defaultVisibility: 'scenario', tags: ['media', 'panel', 'storyboard'], groups: ['panel', 'media'], requiresEpisode: true },
        selection: { baseWeight: 60, costHint: 'high' },
        inputSchema: z.object({}),
        outputSchema: z.unknown(),
        execute: async () => ({}),
      },
      get_project_phase: {
        id: 'get_project_phase',
        description: 'Get project phase',
        scope: 'project',
        sideEffects: { mode: 'query', risk: 'low' },
        channels: { tool: true, api: true },
        tool: { selectable: true, defaultVisibility: 'core', tags: ['project', 'read'], groups: ['project'] },
        selection: { baseWeight: 10, costHint: 'low' },
        inputSchema: z.object({}),
        outputSchema: z.unknown(),
        execute: async () => ({}),
      },
    }
  })

  it('injects asset-focused tools when router returns asset-character category', async () => {
    streamState.routeResult = {
      intent: 'query',
      domains: ['asset'],
      toolCategories: ['asset-character'],
      confidence: 0.93,
      needsClarification: false,
      clarifyingQuestion: null,
      reasoning: ['character asset read request'],
      latestUserText: 'show character',
    }

    const response = await createProjectAgentChatResponse({
      request: buildRequest(),
      userId: 'user-1',
      projectId: 'project-1',
      context: { episodeId: 'ep-1', currentStage: 'storyboard' },
      messages: [
        { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'show character' }] },
      ],
    })
    await flushAsyncWork()

    expect(response.status).toBe(200)
    expect(streamState.capturedToolNames).toContain('get_character_detail')
    expect(streamState.capturedToolNames).not.toContain('regenerate_panel_image')
    expect(streamState.capturedSystem).toContain('get_project_phase')
    expect(loggerState.info).toHaveBeenCalledWith(expect.objectContaining({
      action: 'assistant.tool.selection.result',
      requestId: 'req-1',
      projectId: 'project-1',
      details: expect.objectContaining({
        operationIds: expect.arrayContaining(['get_character_detail']),
        toolCategories: ['asset-character'],
      }),
    }))
  })

  it('injects panel media tools when router returns panel-media category', async () => {
    streamState.routeResult = {
      intent: 'act',
      domains: ['storyboard'],
      toolCategories: ['panel-media'],
      confidence: 0.91,
      needsClarification: false,
      clarifyingQuestion: null,
      reasoning: ['panel image regeneration request'],
      latestUserText: 'regenerate panel image',
    }

    await createProjectAgentChatResponse({
      request: buildRequest(),
      userId: 'user-1',
      projectId: 'project-1',
      context: { episodeId: 'ep-1', currentStage: 'storyboard' },
      messages: [
        { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'regenerate panel image' }] },
      ],
    })
    await flushAsyncWork()

    expect(streamState.capturedToolNames).toContain('regenerate_panel_image')
    expect(streamState.capturedSystem).toContain('get_project_phase')
  })

  it('returns clarification stream without selecting tools when router requires clarification', async () => {
    streamState.routeResult = {
      intent: 'query',
      domains: ['unknown'],
      toolCategories: ['project-overview'],
      confidence: 0.42,
      needsClarification: true,
      clarifyingQuestion: 'Please clarify which part of the project you want me to inspect.',
      reasoning: ['request is ambiguous'],
      latestUserText: 'help me with this',
    }

    await createProjectAgentChatResponse({
      request: buildRequest(),
      userId: 'user-1',
      projectId: 'project-1',
      context: { currentStage: 'config' },
      messages: [
        { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'help me with this' }] },
      ],
    })
    await flushAsyncWork()

    expect(streamState.capturedToolNames).toEqual([])
    expect(streamState.writerEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'text-delta', delta: 'Please clarify which part of the project you want me to inspect.' }),
    ]))
  })

  it('does not inject act tools in plan interaction mode', async () => {
    streamState.routeResult = {
      intent: 'act',
      domains: ['storyboard'],
      toolCategories: ['panel-media', 'workflow-plan'],
      confidence: 0.95,
      needsClarification: false,
      clarifyingQuestion: null,
      reasoning: ['user wants a plan before acting'],
      latestUserText: 'plan this storyboard change',
    }

    await createProjectAgentChatResponse({
      request: buildRequest(),
      userId: 'user-1',
      projectId: 'project-1',
      context: { episodeId: 'ep-1', currentStage: 'storyboard', interactionMode: 'plan' },
      messages: [
        { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'plan this storyboard change' }] },
      ],
    })
    await flushAsyncWork()

    expect(streamState.capturedToolNames).not.toContain('regenerate_panel_image')
  })

  it('keeps act-capable routing in auto interaction mode', async () => {
    streamState.routeResult = {
      intent: 'act',
      domains: ['storyboard'],
      toolCategories: ['panel-media'],
      confidence: 0.95,
      needsClarification: false,
      clarifyingQuestion: null,
      reasoning: ['auto mode should honor act intent'],
      latestUserText: 'regenerate panel image',
    }

    await createProjectAgentChatResponse({
      request: buildRequest(),
      userId: 'user-1',
      projectId: 'project-1',
      context: { episodeId: 'ep-1', currentStage: 'storyboard', interactionMode: 'auto' },
      messages: [
        { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'regenerate panel image' }] },
      ],
    })
    await flushAsyncWork()

    expect(streamState.capturedToolNames).toContain('regenerate_panel_image')
  })
})
