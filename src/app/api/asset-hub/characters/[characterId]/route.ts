import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { ApiError, apiHandler } from '@/lib/api-errors'
import {
    collectBailianManagedVoiceIds,
    cleanupUnreferencedBailianVoices,
} from '@/lib/providers/bailian'

// 获取单个角色
export const GET = apiHandler(async (
    request: NextRequest,
    context: { params: Promise<{ characterId: string }> }
) => {
    const { characterId } = await context.params

    // 🔐 统一权限验证
    const authResult = await requireUserAuth()
    if (isErrorResponse(authResult)) return authResult
    const { session } = authResult

    const character = await prisma.globalCharacter.findUnique({
        where: { id: characterId },
        include: { appearances: true }
    })

    if (!character || character.userId !== session.user.id) {
        throw new ApiError('NOT_FOUND')
    }

    return NextResponse.json({ character })
})

// 更新角色
export const PATCH = apiHandler(async (
    request: NextRequest,
    context: { params: Promise<{ characterId: string }> }
) => {
    const { characterId } = await context.params

    // 🔐 统一权限验证
    const authResult = await requireUserAuth()
    if (isErrorResponse(authResult)) return authResult
    const { session } = authResult

    const character = await prisma.globalCharacter.findUnique({
        where: { id: characterId }
    })

    if (!character || character.userId !== session.user.id) {
        throw new ApiError('FORBIDDEN')
    }

    const body = await request.json()
    const { name, aliases, profileData, profileConfirmed, voiceId, voiceType, customVoiceUrl, folderId, globalVoiceId } = body

    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name.trim()
    if (aliases !== undefined) updateData.aliases = aliases
    if (profileData !== undefined) updateData.profileData = profileData
    if (profileConfirmed !== undefined) updateData.profileConfirmed = profileConfirmed
    if (voiceId !== undefined) updateData.voiceId = voiceId
    if (voiceType !== undefined) updateData.voiceType = voiceType
    if (customVoiceUrl !== undefined) updateData.customVoiceUrl = customVoiceUrl
    if (globalVoiceId !== undefined) updateData.globalVoiceId = globalVoiceId
    if (folderId !== undefined) {
        if (folderId) {
            const folder = await prisma.globalAssetFolder.findUnique({
                where: { id: folderId }
            })
            if (!folder || folder.userId !== session.user.id) {
                throw new ApiError('INVALID_PARAMS')
            }
        }
        updateData.folderId = folderId || null
    }

    const updatedCharacter = await prisma.globalCharacter.update({
        where: { id: characterId },
        data: updateData,
        include: { appearances: true }
    })

    return NextResponse.json({ success: true, character: updatedCharacter })
})

// 删除角色
export const DELETE = apiHandler(async (
    request: NextRequest,
    context: { params: Promise<{ characterId: string }> }
) => {
    const { characterId } = await context.params

    // 🔐 统一权限验证
    const authResult = await requireUserAuth()
    if (isErrorResponse(authResult)) return authResult
    const { session } = authResult

    const character = await prisma.globalCharacter.findUnique({
        where: { id: characterId }
    })

    if (!character || character.userId !== session.user.id) {
        throw new ApiError('FORBIDDEN')
    }

    const candidateVoiceIds = collectBailianManagedVoiceIds([
        {
            voiceId: character.voiceId,
            voiceType: character.voiceType,
        },
    ])
    await cleanupUnreferencedBailianVoices({
        voiceIds: candidateVoiceIds,
        scope: {
            userId: session.user.id,
            excludeGlobalCharacterId: character.id,
        },
    })

    await prisma.globalCharacter.delete({
        where: { id: characterId }
    })

    return NextResponse.json({ success: true })
})
