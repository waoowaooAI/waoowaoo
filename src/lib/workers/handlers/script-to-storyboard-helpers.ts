import { safeParseJson, safeParseJsonArray } from '@/lib/json-repair'
import { prisma } from '@/lib/prisma'
import type { StoryboardPanel } from '@/lib/storyboard-phases'

export type JsonRecord = Record<string, unknown>

export type ClipPanelsResult = {
  clipId: string
  clipIndex: number
  finalPanels: StoryboardPanel[]
}

export type PersistedStoryboard = {
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

export function parseEffort(value: unknown): 'minimal' | 'low' | 'medium' | 'high' | null {
  if (value === 'minimal' || value === 'low' || value === 'medium' || value === 'high') return value
  return null
}

export function parseTemperature(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0.7
  return Math.max(0, Math.min(2, value))
}

export function toPositiveInt(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const n = Math.floor(value)
  return n >= 0 ? n : null
}

function parsePanelCharacters(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map((item) => (typeof item === 'string' ? item : item?.name)).filter(Boolean)
  } catch {
    return []
  }
}

function parseStringArray(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map((item) => (typeof item === 'string' ? item : '')).filter(Boolean)
  } catch {
    return []
  }
}

export function parseVoiceLinesJson(responseText: string): JsonRecord[] {
  const rows = safeParseJsonArray(responseText)
  if (rows.length === 0) {
    const raw = safeParseJson(responseText)
    if (Array.isArray(raw) && raw.length === 0) {
      return []
    }
    throw new Error('voice_analyze: invalid payload')
  }
  return rows as JsonRecord[]
}

export function asJsonRecord(value: unknown): JsonRecord | null {
  return typeof value === 'object' && value !== null ? (value as JsonRecord) : null
}

export function buildStoryboardJson(storyboards: PersistedStoryboard[]) {
  const rows: Array<{
    storyboardId: string
    panelIndex: number
    text_segment: string
    description: string
    characters: string[]
    props: string[]
  }> = []

  for (const storyboard of storyboards) {
    for (const panel of storyboard.panels) {
      rows.push({
        storyboardId: storyboard.storyboardId,
        panelIndex: panel.panelIndex,
        text_segment: panel.srtSegment || '',
        description: panel.description || '',
        characters: parsePanelCharacters(panel.characters),
        props: parseStringArray(panel.props),
      })
    }
  }

  if (rows.length === 0) return '无分镜数据'
  return JSON.stringify(rows, null, 2)
}

export function buildStoryboardJsonFromClipPanels(clipPanels: ClipPanelsResult[]) {
  const rows: Array<{
    storyboardId: string
    panelIndex: number
    text_segment: string
    description: string
    characters: string[]
    props: string[]
  }> = []

  for (const clipEntry of clipPanels) {
    for (let index = 0; index < clipEntry.finalPanels.length; index += 1) {
      const panel = clipEntry.finalPanels[index]
      rows.push({
        storyboardId: clipEntry.clipId,
        panelIndex: index,
        text_segment: panel.source_text || '',
        description: panel.description || '',
        characters: Array.isArray(panel.characters) ? panel.characters.filter(Boolean) : [],
        props: Array.isArray(panel.props) ? panel.props.filter(Boolean) : [],
      })
    }
  }

  if (rows.length === 0) return '无分镜数据'
  return JSON.stringify(rows, null, 2)
}

export async function persistStoryboardsAndPanels(params: {
  episodeId: string
  clipPanels: ClipPanelsResult[]
}) {
  const { episodeId, clipPanels } = params
  type PanelRow = {
    id: string
    panelIndex: number
    description: string | null
    srtSegment: string | null
    characters: string | null
    props: string | null
  }
  return await prisma.$transaction(async (tx) => {
    const persisted: PersistedStoryboard[] = []
    for (const clipEntry of clipPanels) {
      const storyboard = await tx.projectStoryboard.upsert({
        where: { clipId: clipEntry.clipId },
        create: {
          clipId: clipEntry.clipId,
          episodeId,
          panelCount: clipEntry.finalPanels.length,
        },
        update: {
          panelCount: clipEntry.finalPanels.length,
          episodeId,
          lastError: null,
        },
        select: { id: true, clipId: true },
      })

      await tx.projectPanel.deleteMany({
        where: { storyboardId: storyboard.id },
      })

      const panelModel = tx.projectPanel as unknown as {
        create: (args: {
          data: Record<string, unknown>
          select: {
            id: true
            panelIndex: true
            description: true
            srtSegment: true
            characters: true
            props: true
          }
        }) => Promise<PanelRow>
      }
      const persistedPanels: PersistedStoryboard['panels'] = []
      for (let i = 0; i < clipEntry.finalPanels.length; i += 1) {
        const panel = clipEntry.finalPanels[i]
        const created = await panelModel.create({
          data: {
            storyboardId: storyboard.id,
            panelIndex: i,
            panelNumber: panel.panel_number || i + 1,
            shotType: panel.shot_type || '中景',
            cameraMove: panel.camera_move || '固定',
            description: panel.description || null,
            videoPrompt: panel.video_prompt || null,
            location: panel.location || null,
            characters: panel.characters ? JSON.stringify(panel.characters) : null,
            props: panel.props ? JSON.stringify(panel.props) : null,
            srtSegment: panel.source_text || null,
            photographyRules: panel.photographyPlan ? JSON.stringify(panel.photographyPlan) : null,
            actingNotes: panel.actingNotes ? JSON.stringify(panel.actingNotes) : null,
            duration: panel.duration || null,
          },
          select: {
            id: true,
            panelIndex: true,
            description: true,
            srtSegment: true,
            characters: true,
            props: true,
          },
        })
        persistedPanels.push(created)
      }

      persisted.push({
        storyboardId: storyboard.id,
        clipId: storyboard.clipId,
        panels: persistedPanels,
      })
    }
    return persisted
  }, { timeout: 30000 })
}
