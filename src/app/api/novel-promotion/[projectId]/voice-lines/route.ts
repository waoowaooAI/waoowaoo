import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { resolveMediaRef, resolveMediaRefFromLegacyValue } from '@/lib/media/service'

async function resolveMatchedPanelData(
  matchedPanelId: string | null | undefined,
  expectedEpisodeId?: string
) {
  if (matchedPanelId === undefined) {
    return null
  }

  if (matchedPanelId === null) {
    return {
      matchedPanelId: null,
      matchedStoryboardId: null,
      matchedPanelIndex: null
    }
  }

  const panel = await prisma.novelPromotionPanel.findUnique({
    where: { id: matchedPanelId },
    select: {
      id: true,
      storyboardId: true,
      panelIndex: true,
      storyboard: {
        select: {
          episodeId: true
        }
      }
    }
  })

  if (!panel) {
    throw new ApiError('NOT_FOUND')
  }
  if (expectedEpisodeId && panel.storyboard.episodeId !== expectedEpisodeId) {
    throw new ApiError('INVALID_PARAMS')
  }

  return {
    matchedPanelId: panel.id,
    matchedStoryboardId: panel.storyboardId,
    matchedPanelIndex: panel.panelIndex
  }
}

async function withVoiceLineMedia<T extends Record<string, unknown>>(line: T) {
  const audioMedia = await resolveMediaRef(line.audioMediaId, line.audioUrl)
  const matchedPanel = line.matchedPanel as
    | {
      storyboardId?: string | null
      panelIndex?: number | null
    }
    | null
    | undefined
  return {
    ...line,
    media: audioMedia,
    audioMedia,
    audioUrl: audioMedia?.url || line.audioUrl || null,
    matchedStoryboardId: matchedPanel?.storyboardId ?? line.matchedStoryboardId,
    matchedPanelIndex: matchedPanel?.panelIndex ?? line.matchedPanelIndex}
}

/**
 * GET /api/novel-promotion/[projectId]/voice-lines?episodeId=xxx
 * 获取剧集的台词列表
 */
export const GET = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const { searchParams } = new URL(request.url)
  const episodeId = searchParams.get('episodeId')
  const speakersOnly = searchParams.get('speakersOnly')

  if (speakersOnly === '1') {
    const novelProject = await prisma.novelPromotionProject.findUnique({
      where: { projectId },
      select: { id: true }
    })
    if (!novelProject) {
      throw new ApiError('NOT_FOUND')
    }

    const speakerRows = await prisma.novelPromotionVoiceLine.findMany({
      where: {
        episode: {
          novelPromotionProjectId: novelProject.id
        }
      },
      select: { speaker: true },
      distinct: ['speaker'],
      orderBy: { speaker: 'asc' }
    })

    return NextResponse.json({
      speakers: speakerRows.map(item => item.speaker).filter(Boolean)
    })
  }

  if (!episodeId) {
    throw new ApiError('INVALID_PARAMS')
  }

  // 获取台词列表（包含匹配的 Panel 信息）
  const voiceLines = await prisma.novelPromotionVoiceLine.findMany({
    where: { episodeId },
    orderBy: { lineIndex: 'asc' },
    include: {
      matchedPanel: {
        select: {
          id: true,
          storyboardId: true,
          panelIndex: true
        }
      }
    }
  })

  // 转换为稳定媒体 URL，并添加兼容字段
  const voiceLinesWithUrls = await Promise.all(voiceLines.map(withVoiceLineMedia))

  // 统计发言人
  const speakerStats: Record<string, number> = {}
  for (const line of voiceLines) {
    speakerStats[line.speaker] = (speakerStats[line.speaker] || 0) + 1
  }

  return NextResponse.json({
    voiceLines: voiceLinesWithUrls,
    count: voiceLines.length,
    speakerStats
  })
})

/**
 * POST /api/novel-promotion/[projectId]/voice-lines
 * 新增单条台词
 * Body: { episodeId, content, speaker, matchedPanelId?: string | null }
 */
export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json()
  const { episodeId, content, speaker, matchedPanelId } = body

  if (!episodeId) {
    throw new ApiError('INVALID_PARAMS')
  }
  if (!content || !content.trim()) {
    throw new ApiError('INVALID_PARAMS')
  }
  if (!speaker || !speaker.trim()) {
    throw new ApiError('INVALID_PARAMS')
  }

  const novelPromotionProject = await prisma.novelPromotionProject.findUnique({
    where: { projectId },
    select: { id: true }
  })
  if (!novelPromotionProject) {
    throw new ApiError('NOT_FOUND')
  }

  const episode = await prisma.novelPromotionEpisode.findFirst({
    where: {
      id: episodeId,
      novelPromotionProjectId: novelPromotionProject.id
    },
    select: { id: true }
  })
  if (!episode) {
    throw new ApiError('NOT_FOUND')
  }

  const maxLine = await prisma.novelPromotionVoiceLine.findFirst({
    where: { episodeId },
    orderBy: { lineIndex: 'desc' },
    select: { lineIndex: true }
  })
  const nextLineIndex = (maxLine?.lineIndex || 0) + 1

  const matchedPanelData = await resolveMatchedPanelData(
    matchedPanelId === undefined ? undefined : matchedPanelId,
    episodeId
  )

  const created = await prisma.novelPromotionVoiceLine.create({
    data: {
      episodeId,
      lineIndex: nextLineIndex,
      content: content.trim(),
      speaker: speaker.trim(),
      ...(matchedPanelData || {})
    },
    include: {
      matchedPanel: {
        select: {
          id: true,
          storyboardId: true,
          panelIndex: true
        }
      }
    }
  })

  const voiceLine = await withVoiceLineMedia(created)

  return NextResponse.json({
    success: true,
    voiceLine
  })
})

/**
 * PATCH /api/novel-promotion/[projectId]/voice-lines
 * 更新台词设置（内容、发言人、情绪设置、音频URL）
 * Body: { lineId, content, speaker, emotionPrompt, emotionStrength, audioUrl } 
 *    或 { speaker, episodeId, voicePresetId } (批量更新同一发言人的音色)
 */
export const PATCH = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json()
  const {
    lineId,
    speaker,
    episodeId,
    voicePresetId,
    emotionPrompt,
    emotionStrength,
    content,
    audioUrl,
    matchedPanelId
  } = body

  // 单条更新
  if (lineId) {
    const updateData: Prisma.NovelPromotionVoiceLineUncheckedUpdateInput = {}
    if (voicePresetId !== undefined) updateData.voicePresetId = voicePresetId
    if (emotionPrompt !== undefined) updateData.emotionPrompt = emotionPrompt || null
    if (emotionStrength !== undefined) updateData.emotionStrength = emotionStrength
    if (content !== undefined) {
      if (!content.trim()) {
        throw new ApiError('INVALID_PARAMS')
      }
      updateData.content = content.trim()
    }
    if (speaker !== undefined) {
      if (!speaker.trim()) {
        throw new ApiError('INVALID_PARAMS')
      }
      updateData.speaker = speaker.trim()
    }
    if (audioUrl !== undefined) {
      updateData.audioUrl = audioUrl // 支持清空音频 (传 null)
      const media = await resolveMediaRefFromLegacyValue(audioUrl)
      updateData.audioMediaId = media?.id || null
    }
    if (matchedPanelId !== undefined) {
      const currentLine = await prisma.novelPromotionVoiceLine.findUnique({
        where: { id: lineId },
        select: { episodeId: true }
      })
      if (!currentLine) {
        throw new ApiError('NOT_FOUND')
      }

      const matchedPanelData = await resolveMatchedPanelData(matchedPanelId, currentLine.episodeId)
      if (matchedPanelData) {
        updateData.matchedPanelId = matchedPanelData.matchedPanelId
        updateData.matchedStoryboardId = matchedPanelData.matchedStoryboardId
        updateData.matchedPanelIndex = matchedPanelData.matchedPanelIndex
      }
    }

    const updated = await prisma.novelPromotionVoiceLine.update({
      where: { id: lineId },
      data: updateData,
      include: {
        matchedPanel: {
          select: {
            id: true,
            storyboardId: true,
            panelIndex: true
          }
        }
      }
    })
    return NextResponse.json({
      success: true,
      voiceLine: await withVoiceLineMedia(updated)
    })
  }

  // 批量更新同一发言人（仅支持更新音色）
  if (speaker && episodeId) {
    const result = await prisma.novelPromotionVoiceLine.updateMany({
      where: {
        episodeId,
        speaker
      },
      data: { voicePresetId }
    })
    return NextResponse.json({
      success: true,
      updatedCount: result.count,
      speaker,
      voicePresetId
    })
  }

  throw new ApiError('INVALID_PARAMS')
})

/**
 * DELETE /api/novel-promotion/[projectId]/voice-lines?lineId=xxx
 * 删除单条台词
 */
export const DELETE = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const { searchParams } = new URL(request.url)
  const lineId = searchParams.get('lineId')

  if (!lineId) {
    throw new ApiError('INVALID_PARAMS')
  }

  // 获取要删除的台词
  const lineToDelete = await prisma.novelPromotionVoiceLine.findUnique({
    where: { id: lineId }
  })

  if (!lineToDelete) {
    throw new ApiError('NOT_FOUND')
  }

  // 删除台词
  await prisma.novelPromotionVoiceLine.delete({
    where: { id: lineId }
  })

  // 重新排序剩余台词的 lineIndex
  const remainingLines = await prisma.novelPromotionVoiceLine.findMany({
    where: { episodeId: lineToDelete.episodeId },
    orderBy: { lineIndex: 'asc' }
  })

  // 更新每条台词的 lineIndex
  for (let i = 0; i < remainingLines.length; i++) {
    if (remainingLines[i].lineIndex !== i + 1) {
      await prisma.novelPromotionVoiceLine.update({
        where: { id: remainingLines[i].id },
        data: { lineIndex: i + 1 }
      })
    }
  }

  return NextResponse.json({
    success: true,
    deletedId: lineId,
    remainingCount: remainingLines.length
  })
})
