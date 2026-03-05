import { NextRequest, NextResponse } from 'next/server'
import { ApiError, apiHandler } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

type ExportType = 'script' | 'storyboard' | 'shot_list' | 'video'

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asExportType(value: unknown): ExportType | null {
  if (value === 'script' || value === 'storyboard' || value === 'shot_list' || value === 'video') return value
  return null
}

function normalizeFilePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'project'
}

function toTimestamp(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  const hour = String(value.getHours()).padStart(2, '0')
  const minute = String(value.getMinutes()).padStart(2, '0')
  const second = String(value.getSeconds()).padStart(2, '0')
  return `${year}${month}${day}${hour}${minute}${second}`
}

function buildFileName(projectId: string, exportType: ExportType, ext: string) {
  const now = new Date()
  return `ivibemovie_${normalizeFilePart(projectId)}_${exportType}_${toTimestamp(now)}.${ext}`
}

function csvCell(value: string | number | null | undefined): string {
  const text = String(value ?? '')
  const escaped = text.replace(/"/g, '""')
  return `"${escaped}"`
}

function parseExportType(request: NextRequest, body: Record<string, unknown> | null): ExportType {
  const queryType = request.nextUrl.searchParams.get('type')
  const fromBody = body ? asExportType(body.exportType) : null
  const fromQuery = asExportType(queryType)
  const exportType = fromBody || fromQuery
  if (!exportType) {
    throw new ApiError('INVALID_PARAMS', { message: 'exportType 必须是 script/storyboard/shot_list/video' })
  }
  return exportType
}

function collectTimelineUrls(projectData: unknown): string[] {
  const data = asObject(projectData)
  if (!data) return []
  const timeline = Array.isArray(data.timeline) ? data.timeline : []

  const urls: string[] = []
  for (const item of timeline) {
    const row = asObject(item)
    if (!row) continue
    const src = row.src
    if (typeof src === 'string' && src.trim().length > 0) {
      urls.push(src.trim())
    }
  }
  return urls
}

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  if (!projectId) {
    throw new ApiError('INVALID_PARAMS', { message: 'projectId 不能为空' })
  }

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const bodyRaw = await request.json().catch(() => ({}))
  const body = asObject(bodyRaw)
  const exportType = parseExportType(request, body)

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      description: true,
      episodes: {
        orderBy: { episodeIndex: 'asc' },
        select: {
          id: true,
          episodeIndex: true,
          name: true,
          segments: {
            orderBy: { segmentIndex: 'asc' },
            select: {
              id: true,
              segmentIndex: true,
              summary: true,
              content: true,
              screenplay: true,
              startTime: true,
              endTime: true,
              storyboardEntries: {
                orderBy: { entryIndex: 'asc' },
                select: {
                  id: true,
                  entryIndex: true,
                  startTime: true,
                  endTime: true,
                  description: true,
                  dialogue: true,
                  dialogueTone: true,
                  soundEffect: true,
                  shotType: true,
                  cameraMove: true,
                },
              },
            },
          },
        },
      },
    },
  })

  if (!project) {
    throw new ApiError('NOT_FOUND', { message: '项目不存在' })
  }

  const timelineProject = await prisma.timelineProject.findUnique({
    where: { projectId },
    select: {
      outputUrl: true,
      projectData: true,
    },
  })

  const generatedAt = new Date().toISOString()

  if (exportType === 'script') {
    const lines: string[] = []
    lines.push(`# ${project.name || 'Untitled Project'}`)
    lines.push('')
    if (project.description) {
      lines.push(project.description)
      lines.push('')
    }
    for (const episode of project.episodes) {
      lines.push(`## 第 ${episode.episodeIndex + 1} 集 ${episode.name || ''}`.trim())
      for (const segment of episode.segments) {
        lines.push(`- 片段 ${segment.segmentIndex + 1} [${segment.startTime}s-${segment.endTime}s]`)
        if (segment.screenplay) lines.push(`  剧本：${segment.screenplay}`)
        else if (segment.content) lines.push(`  内容：${segment.content}`)
        else if (segment.summary) lines.push(`  摘要：${segment.summary}`)
      }
      lines.push('')
    }

    return NextResponse.json({
      ok: true,
      export: {
        exportType,
        fileName: buildFileName(project.id, exportType, 'txt'),
        mimeType: 'text/plain; charset=utf-8',
        content: lines.join('\n'),
        generatedAt,
      },
    })
  }

  if (exportType === 'storyboard') {
    const rows: string[] = []
    rows.push([
      'episode_index',
      'segment_index',
      'entry_index',
      'start_sec',
      'end_sec',
      'description',
      'dialogue',
      'dialogue_tone',
      'sound_effect',
    ].join(','))

    for (const episode of project.episodes) {
      for (const segment of episode.segments) {
        for (const entry of segment.storyboardEntries) {
          rows.push([
            csvCell(episode.episodeIndex + 1),
            csvCell(segment.segmentIndex + 1),
            csvCell(entry.entryIndex + 1),
            csvCell(entry.startTime),
            csvCell(entry.endTime),
            csvCell(entry.description),
            csvCell(entry.dialogue),
            csvCell(entry.dialogueTone),
            csvCell(entry.soundEffect),
          ].join(','))
        }
      }
    }

    return NextResponse.json({
      ok: true,
      export: {
        exportType,
        fileName: buildFileName(project.id, exportType, 'csv'),
        mimeType: 'text/csv; charset=utf-8',
        content: rows.join('\n'),
        generatedAt,
      },
    })
  }

  if (exportType === 'shot_list') {
    const rows: string[] = []
    rows.push([
      'episode_index',
      'segment_index',
      'entry_index',
      'shot_type',
      'camera_move',
      'start_sec',
      'end_sec',
      'description',
    ].join(','))

    for (const episode of project.episodes) {
      for (const segment of episode.segments) {
        for (const entry of segment.storyboardEntries) {
          rows.push([
            csvCell(episode.episodeIndex + 1),
            csvCell(segment.segmentIndex + 1),
            csvCell(entry.entryIndex + 1),
            csvCell(entry.shotType),
            csvCell(entry.cameraMove),
            csvCell(entry.startTime),
            csvCell(entry.endTime),
            csvCell(entry.description),
          ].join(','))
        }
      }
    }

    return NextResponse.json({
      ok: true,
      export: {
        exportType,
        fileName: buildFileName(project.id, exportType, 'csv'),
        mimeType: 'text/csv; charset=utf-8',
        content: rows.join('\n'),
        generatedAt,
      },
    })
  }

  const outputUrl = typeof timelineProject?.outputUrl === 'string' && timelineProject.outputUrl.trim()
    ? timelineProject.outputUrl.trim()
    : null

  if (outputUrl) {
    return NextResponse.json({
      ok: true,
      export: {
        exportType,
        fileName: buildFileName(project.id, exportType, 'mp4'),
        mimeType: 'video/mp4',
        url: outputUrl,
        generatedAt,
      },
    })
  }

  const timelineUrls = collectTimelineUrls(timelineProject?.projectData)
  if (timelineUrls.length === 0) {
    throw new ApiError('NOT_FOUND', { message: '暂无可导出视频' })
  }

  return NextResponse.json({
    ok: true,
    export: {
      exportType,
      fileName: buildFileName(project.id, exportType, 'json'),
      mimeType: 'application/json; charset=utf-8',
      content: JSON.stringify({
        strategy: 'mvp_timeline_manifest',
        clips: timelineUrls,
      }, null, 2),
      generatedAt,
    },
  })
})
