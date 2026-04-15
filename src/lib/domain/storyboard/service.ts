import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { StoryboardPanel } from '@/lib/storyboard-phases'
import { assertApprovedDomainMutationContext } from '@/lib/domain/approvals/guard'
import {
  assertNonEmptyText,
  type DomainMutationContext,
  DomainValidationError,
} from '@/lib/domain/shared'
import { createProjectRepository } from '@/lib/domain/repositories/project-workflow'

export type StoryboardJsonRecord = Record<string, unknown>

export type StoryboardClipPanelsResult = {
  clipId: string
  clipIndex: number
  finalPanels: StoryboardPanel[]
}

export type PersistedStoryboardResult = {
  storyboardId: string
  clipId: string
  panels: Array<{
    id: string
    panelIndex: number
    description: string | null
    srtSegment: string | null
    characters: string | null
    props: string | null
  }>
}

function toPositiveInt(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const n = Math.floor(value)
  return n >= 0 ? n : null
}

function asJsonRecord(value: unknown): StoryboardJsonRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as StoryboardJsonRecord
}

function assertMutationContext(input: DomainMutationContext) {
  if (!input.runId?.trim()) {
    throw new DomainValidationError('mutation runId is required')
  }
  if (!input.workflowId) {
    throw new DomainValidationError('mutation workflowId is required')
  }
  if (!input.idempotencyKey?.trim()) {
    throw new DomainValidationError('mutation idempotencyKey is required')
  }
}

async function replaceStoryboards(params: {
  tx: Prisma.TransactionClient
  episodeId: string
  clipPanels: StoryboardClipPanelsResult[]
}) {
  const repository = createProjectRepository(params.tx)
  const persisted: PersistedStoryboardResult[] = []
  const panelIdByStoryboardRef = new Map<string, string>()
  const storyboardIdByRef = new Map<string, string>()

  for (const clipEntry of params.clipPanels) {
    const storyboard = await repository.upsertStoryboard({
      clipId: clipEntry.clipId,
      episodeId: params.episodeId,
      panelCount: clipEntry.finalPanels.length,
    })
    storyboardIdByRef.set(storyboard.id, storyboard.id)
    storyboardIdByRef.set(clipEntry.clipId, storyboard.id)

    await repository.deletePanelsByStoryboardId(storyboard.id)

    const panels: PersistedStoryboardResult['panels'] = []
    for (let index = 0; index < clipEntry.finalPanels.length; index += 1) {
      const panel = clipEntry.finalPanels[index]
      const created = await repository.createPanel({
        storyboardId: storyboard.id,
        panelIndex: index,
        panelNumber: panel.panel_number || index + 1,
        shotType: panel.shot_type || '中景',
        cameraMove: panel.camera_move || '固定',
        description: panel.description || null,
        videoPrompt: panel.video_prompt || null,
        location: panel.location || null,
        charactersJson: panel.characters ? JSON.stringify(panel.characters) : null,
        propsJson: panel.props ? JSON.stringify(panel.props) : null,
        srtSegment: panel.source_text || null,
        photographyRulesJson: panel.photographyPlan ? JSON.stringify(panel.photographyPlan) : null,
        actingNotesJson: panel.actingNotes ? JSON.stringify(panel.actingNotes) : null,
        duration: typeof panel.duration === 'number' ? panel.duration : null,
      })
      panelIdByStoryboardRef.set(`${storyboard.id}:${created.panelIndex}`, created.id)
      panelIdByStoryboardRef.set(`${clipEntry.clipId}:${created.panelIndex}`, created.id)
      panels.push(created)
    }

    persisted.push({
      storyboardId: storyboard.id,
      clipId: storyboard.clipId,
      panels,
    })
  }

  return {
    persistedStoryboards: persisted,
    panelIdByStoryboardRef,
    storyboardIdByRef,
  }
}

async function replaceVoiceLines(params: {
  tx: Prisma.TransactionClient
  episodeId: string
  voiceLineRows: StoryboardJsonRecord[]
  panelIdByStoryboardRef: Map<string, string>
  storyboardIdByRef: Map<string, string>
}) {
  const repository = createProjectRepository(params.tx)
  const createdVoiceLines: Array<{ id: string }> = []

  for (let index = 0; index < params.voiceLineRows.length; index += 1) {
    const row = params.voiceLineRows[index] || {}
    const matchedPanel = asJsonRecord(row.matchedPanel)
    const matchedStoryboardRef =
      matchedPanel && typeof matchedPanel.storyboardId === 'string'
        ? matchedPanel.storyboardId.trim()
        : null
    const matchedPanelIndex = matchedPanel ? toPositiveInt(matchedPanel.panelIndex) : null
    let matchedPanelId: string | null = null
    let matchedStoryboardId: string | null = null

    if (matchedPanel !== null) {
      if (!matchedStoryboardRef || matchedPanelIndex === null) {
        throw new DomainValidationError(`voice line ${index + 1} has invalid matchedPanel reference`)
      }
      matchedStoryboardId = params.storyboardIdByRef.get(matchedStoryboardRef) || null
      if (!matchedStoryboardId) {
        throw new DomainValidationError(
          `voice line ${index + 1} references non-existent storyboard ${matchedStoryboardRef}`,
        )
      }
      matchedPanelId = params.panelIdByStoryboardRef.get(`${matchedStoryboardRef}:${matchedPanelIndex}`) || null
      if (!matchedPanelId) {
        throw new DomainValidationError(
          `voice line ${index + 1} references non-existent panel ${matchedStoryboardRef}:${matchedPanelIndex}`,
        )
      }
    }

    if (typeof row.emotionStrength !== 'number' || !Number.isFinite(row.emotionStrength)) {
      throw new DomainValidationError(`voice line ${index + 1} is missing valid emotionStrength`)
    }
    if (typeof row.lineIndex !== 'number' || !Number.isFinite(row.lineIndex)) {
      throw new DomainValidationError(`voice line ${index + 1} is missing valid lineIndex`)
    }
    if (typeof row.speaker !== 'string' || !row.speaker.trim()) {
      throw new DomainValidationError(`voice line ${index + 1} is missing valid speaker`)
    }
    if (typeof row.content !== 'string' || !row.content.trim()) {
      throw new DomainValidationError(`voice line ${index + 1} is missing valid content`)
    }

    const lineIndex = Math.floor(row.lineIndex)
    if (lineIndex <= 0) {
      throw new DomainValidationError(`voice line ${index + 1} has invalid lineIndex`)
    }

    const created = await repository.upsertVoiceLine({
      episodeId: params.episodeId,
      lineIndex,
      speaker: row.speaker.trim(),
      content: row.content,
      emotionStrength: Math.min(1, Math.max(0.1, row.emotionStrength)),
      matchedPanelId,
      matchedStoryboardId,
      matchedPanelIndex,
    })
    createdVoiceLines.push(created)
  }

  const nextLineIndexes = params.voiceLineRows
    .map((row) => (typeof row.lineIndex === 'number' && Number.isFinite(row.lineIndex) ? Math.floor(row.lineIndex) : -1))
    .filter((value) => value > 0)

  if (nextLineIndexes.length === 0) {
    await repository.deleteVoiceLinesForEpisode(params.episodeId)
  } else {
    await repository.deleteVoiceLinesNotIn({
      episodeId: params.episodeId,
      lineIndexes: nextLineIndexes,
    })
  }

  return createdVoiceLines.length
}

export async function persistStoryboardWorkflowOutputs(input: {
  episodeId: string
  clipPanels: StoryboardClipPanelsResult[]
  voiceLineRows: StoryboardJsonRecord[] | null
  mutation: DomainMutationContext
}) {
  assertMutationContext(input.mutation)
  assertNonEmptyText(input.episodeId, 'episodeId')
  await assertApprovedDomainMutationContext(input.mutation)

  return await prisma.$transaction(async (tx) => {
    const storyboardResult = await replaceStoryboards({
      tx,
      episodeId: input.episodeId,
      clipPanels: input.clipPanels,
    })
    const voiceLineCount = await replaceVoiceLines({
      tx,
      episodeId: input.episodeId,
      voiceLineRows: input.voiceLineRows ?? [],
      panelIdByStoryboardRef: storyboardResult.panelIdByStoryboardRef,
      storyboardIdByRef: storyboardResult.storyboardIdByRef,
    })

    return {
      persistedStoryboards: storyboardResult.persistedStoryboards,
      voiceLineCount,
    }
  }, { timeout: 30000 })
}
