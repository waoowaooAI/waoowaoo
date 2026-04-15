import { prisma } from '@/lib/prisma'
import { listArtifacts, listRuns } from '@/lib/run-runtime/service'
import { resolvePolicy } from '@/lib/policy-system/resolver'
import type { ProjectContextSnapshot } from '@/lib/project-context/types'

type ApprovalSummaryRow = {
  id: string
  status: string
  createdAt: Date
  plan: {
    linkedRunId: string | null
  }
}

async function listLatestArtifactsForContext(params: {
  userId: string
  projectId: string
  episodeId?: string | null
}) {
  const latestRun = (await listRuns({
    userId: params.userId,
    projectId: params.projectId,
    episodeId: params.episodeId || undefined,
    limit: 1,
  }))[0] || null
  if (!latestRun) return []
  const artifacts = await listArtifacts({
    runId: latestRun.id,
    limit: 20,
  })
  return artifacts.map((artifact) => ({
    type: artifact.artifactType,
    refId: artifact.refId,
    createdAt: artifact.createdAt,
  }))
}

export async function assembleProjectWorkflowContext(params: {
  projectId: string
  userId: string
  episodeId?: string | null
  currentStage?: string | null
  selectedScopeRef?: string | null
}): Promise<ProjectContextSnapshot> {
  const [project, episode, runs, latestArtifacts, approvals] = await Promise.all([
    prisma.project.findUnique({
      where: { id: params.projectId },
    }),
    params.episodeId
      ? prisma.projectEpisode.findUnique({
          where: { id: params.episodeId },
          include: {
            clips: {
              orderBy: { createdAt: 'asc' },
              include: {
                storyboard: {
                  include: {
                    panels: {
                      orderBy: { panelIndex: 'asc' },
                      select: {
                        id: true,
                        panelIndex: true,
                        description: true,
                      },
                    },
                  },
                },
              },
            },
            voiceLines: {
              orderBy: { lineIndex: 'asc' },
              select: {
                id: true,
              },
            },
          },
        })
      : Promise.resolve(null),
    listRuns({
      userId: params.userId,
      projectId: params.projectId,
      episodeId: params.episodeId || undefined,
      statuses: ['queued', 'running', 'canceling'],
      limit: 10,
    }),
    listLatestArtifactsForContext({
      userId: params.userId,
      projectId: params.projectId,
      episodeId: params.episodeId || undefined,
    }),
    params.episodeId
      ? prisma.planApproval.findMany({
          where: {
            projectId: params.projectId,
            status: {
              in: ['pending', 'approved'],
            },
            plan: {
              episodeId: params.episodeId,
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            plan: {
              select: {
                linkedRunId: true,
              },
            },
          },
        }) as Promise<ApprovalSummaryRow[]>
      : Promise.resolve([] as ApprovalSummaryRow[]),
  ])

  if (!project) {
    throw new Error(`PROJECT_CONTEXT_NOT_FOUND: ${params.projectId}`)
  }

  const policy = resolvePolicy({
    projectId: params.projectId,
    episodeId: params.episodeId || null,
    projectPolicy: {
      projectId: params.projectId,
      episodeId: params.episodeId || null,
      videoRatio: project.videoRatio,
      artStyle: project.artStyle,
      analysisModel: project.analysisModel,
      overrides: {},
    },
  })

  const clipSnapshots = (episode?.clips || []).map((clip) => ({
    clipId: clip.id,
    summary: clip.summary,
    screenplayReady: !!clip.screenplay,
    storyboardReady: !!clip.storyboard,
    panelCount: clip.storyboard?.panels.length || 0,
  }))
  const panelSnapshots = (episode?.clips || []).flatMap((clip) =>
    (clip.storyboard?.panels || []).map((panel) => ({
      panelId: panel.id,
      clipId: clip.id,
      storyboardId: clip.storyboard?.id || '',
      panelIndex: panel.panelIndex,
      description: panel.description,
    })),
  )
  const storyboardCount = (episode?.clips || []).filter((clip) => !!clip.storyboard).length
  const panelCount = panelSnapshots.length
  const screenplayClipCount = (episode?.clips || []).filter((clip) => !!clip.screenplay).length

  return {
    projectId: project.id,
    projectName: project.name,
    episodeId: episode?.id || null,
    episodeName: episode?.name || null,
    currentStage: params.currentStage || null,
    selectedScopeRef: params.selectedScopeRef || null,
    latestArtifacts,
    activeRuns: runs.map((run) => ({
      id: run.id,
      workflowType: run.workflowType,
      status: run.status,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
    })),
    policy,
    workflow: {
      latestRunId: runs[0]?.id || null,
      episode: episode
        ? {
            novelText: episode.novelText || null,
            clipCount: episode.clips.length,
            screenplayClipCount,
            storyboardCount,
            panelCount,
            voiceLineCount: episode.voiceLines.length,
          }
        : null,
      clips: clipSnapshots,
      panels: panelSnapshots,
      approvals: approvals.map((approval) => ({
        id: approval.id,
        status: approval.status,
        createdAt: approval.createdAt.toISOString(),
        linkedRunId: approval.plan.linkedRunId,
      })),
    },
  }
}
