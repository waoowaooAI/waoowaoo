import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import type { ProjectAssistantId } from '@/lib/project-agent/types'
import type { ProjectAgentToolSelection } from './tool-selection'
import { normalizeProjectAgentToolSelection } from './tool-selection'

export const PROJECT_ASSISTANT_TOOL_SELECTION_SCOPE = {
  GLOBAL: 'global',
  PROJECT: 'project',
  EPISODE: 'episode',
} as const

export type ProjectAssistantToolSelectionScope =
  (typeof PROJECT_ASSISTANT_TOOL_SELECTION_SCOPE)[keyof typeof PROJECT_ASSISTANT_TOOL_SELECTION_SCOPE]

export interface ProjectAssistantToolSelectionSnapshot {
  scope: ProjectAssistantToolSelectionScope
  scopeRef: string
  selection: ProjectAgentToolSelection
  updatedAt: string
}

function buildScopeRef(params: {
  scope: ProjectAssistantToolSelectionScope
  projectId?: string | null
  episodeId?: string | null
}): string {
  if (params.scope === PROJECT_ASSISTANT_TOOL_SELECTION_SCOPE.GLOBAL) return 'global'
  if (params.scope === PROJECT_ASSISTANT_TOOL_SELECTION_SCOPE.PROJECT) {
    if (!params.projectId) throw new Error('PROJECT_AGENT_TOOL_SELECTION_SCOPE_INVALID')
    return `project:${params.projectId}`
  }
  if (!params.episodeId) throw new Error('PROJECT_AGENT_TOOL_SELECTION_SCOPE_INVALID')
  return `episode:${params.episodeId}`
}

function toIsoString(value: Date): string {
  return value.toISOString()
}

export async function loadProjectAssistantToolSelection(params: {
  userId: string
  assistantId: ProjectAssistantId
  scope: ProjectAssistantToolSelectionScope
  projectId?: string | null
  episodeId?: string | null
}): Promise<ProjectAssistantToolSelectionSnapshot | null> {
  const scopeRef = buildScopeRef(params)
  const row = await prisma.projectAssistantToolSelection.findUnique({
    where: {
      userId_assistantId_scopeRef: {
        userId: params.userId,
        assistantId: params.assistantId,
        scopeRef,
      },
    },
    select: {
      scopeRef: true,
      selectionJson: true,
      updatedAt: true,
    },
  })
  if (!row) return null
  const selection = normalizeProjectAgentToolSelection(row.selectionJson)
  if (!selection) {
    throw new Error('PROJECT_AGENT_TOOL_SELECTION_CORRUPTED')
  }
  return {
    scope: params.scope,
    scopeRef: row.scopeRef,
    selection,
    updatedAt: toIsoString(row.updatedAt),
  }
}

export async function saveProjectAssistantToolSelection(params: {
  userId: string
  assistantId: ProjectAssistantId
  scope: ProjectAssistantToolSelectionScope
  projectId?: string | null
  episodeId?: string | null
  selection: ProjectAgentToolSelection
}): Promise<ProjectAssistantToolSelectionSnapshot> {
  const scopeRef = buildScopeRef(params)
  const projectId = params.scope === PROJECT_ASSISTANT_TOOL_SELECTION_SCOPE.PROJECT
    ? params.projectId ?? null
    : null
  const episodeId = params.scope === PROJECT_ASSISTANT_TOOL_SELECTION_SCOPE.EPISODE
    ? params.episodeId ?? null
    : null

  const saved = await prisma.projectAssistantToolSelection.upsert({
    where: {
      userId_assistantId_scopeRef: {
        userId: params.userId,
        assistantId: params.assistantId,
        scopeRef,
      },
    },
    update: {
      selectionJson: params.selection as unknown as Prisma.InputJsonValue,
    },
    create: {
      userId: params.userId,
      assistantId: params.assistantId,
      scopeRef,
      projectId,
      episodeId,
      selectionJson: params.selection as unknown as Prisma.InputJsonValue,
    },
    select: {
      scopeRef: true,
      updatedAt: true,
    },
  })

  return {
    scope: params.scope,
    scopeRef: saved.scopeRef,
    selection: params.selection,
    updatedAt: toIsoString(saved.updatedAt),
  }
}

export async function clearProjectAssistantToolSelection(params: {
  userId: string
  assistantId: ProjectAssistantId
  scope: ProjectAssistantToolSelectionScope
  projectId?: string | null
  episodeId?: string | null
}): Promise<void> {
  const scopeRef = buildScopeRef(params)
  await prisma.projectAssistantToolSelection.deleteMany({
    where: {
      userId: params.userId,
      assistantId: params.assistantId,
      scopeRef,
    },
  })
}

export async function resolveEffectiveProjectAssistantToolSelection(params: {
  userId: string
  assistantId: ProjectAssistantId
  projectId: string
  episodeId?: string | null
}): Promise<ProjectAgentToolSelection | null> {
  const episodeId = params.episodeId ?? null

  if (episodeId) {
    const episode = await loadProjectAssistantToolSelection({
      userId: params.userId,
      assistantId: params.assistantId,
      scope: PROJECT_ASSISTANT_TOOL_SELECTION_SCOPE.EPISODE,
      episodeId,
    })
    if (episode) return episode.selection
  }

  const project = await loadProjectAssistantToolSelection({
    userId: params.userId,
    assistantId: params.assistantId,
    scope: PROJECT_ASSISTANT_TOOL_SELECTION_SCOPE.PROJECT,
    projectId: params.projectId,
  })
  if (project) return project.selection

  const global = await loadProjectAssistantToolSelection({
    userId: params.userId,
    assistantId: params.assistantId,
    scope: PROJECT_ASSISTANT_TOOL_SELECTION_SCOPE.GLOBAL,
  })
  return global?.selection ?? null
}
