import { logWarn as _ulogWarn } from '@/lib/logging/core'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { decodeImageUrlsFromDb, encodeImageUrls } from '@/lib/contracts/image-urls-contract'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { PRIMARY_APPEARANCE_INDEX } from '@/lib/constants'
import { deleteObject } from '@/lib/storage'
import { resolveStorageKeyFromMediaValue } from '@/lib/media/service'

interface SelectImageBody {
    type?: 'character' | 'location'
    id?: string
    appearanceIndex?: number
    imageIndex?: number
    confirm?: boolean
}

/**
 * POST /api/asset-hub/select-image
 * 选择/确认图片方案
 */
export const POST = apiHandler(async (request: NextRequest) => {
    // 🔐 统一权限验证
    const authResult = await requireUserAuth()
    if (isErrorResponse(authResult)) return authResult
    const { session } = authResult

    const body = (await request.json()) as SelectImageBody
    const { type, id, appearanceIndex, imageIndex, confirm } = body

    if (type === 'character') {
        const appearance = await prisma.globalCharacterAppearance.findFirst({
            where: {
                characterId: id,
                appearanceIndex: appearanceIndex ?? PRIMARY_APPEARANCE_INDEX,
                character: { userId: session.user.id }
            }
        })

        if (!appearance) {
            throw new ApiError('NOT_FOUND')
        }

        if (confirm && appearance.selectedIndex !== null) {
            // 确认选择：只保留选中的图片，删除其他候选
            const imageUrls = decodeImageUrlsFromDb(appearance.imageUrls, 'globalCharacterAppearance.imageUrls')
            const selectedUrl = imageUrls[appearance.selectedIndex]

            if (!selectedUrl) {
                throw new ApiError('NOT_FOUND')
            }

            // 从存储中删除未选中的图片
            for (let i = 0; i < imageUrls.length; i++) {
                if (i !== appearance.selectedIndex && imageUrls[i]) {
                    const key = await resolveStorageKeyFromMediaValue(imageUrls[i]!)
                    if (key) {
                        try { await deleteObject(key) } catch { _ulogWarn('Failed to delete image:', key) }
                    }
                }
            }

            // 同时处理 descriptions，只保留选中的描述
            let descriptions: string[] = []
            if (appearance.descriptions) {
                try { descriptions = JSON.parse(appearance.descriptions) } catch { /* ignore */ }
            }
            const selectedDescription = descriptions[appearance.selectedIndex] || appearance.description || ''

            await prisma.globalCharacterAppearance.update({
                where: { id: appearance.id },
                data: {
                    imageUrl: selectedUrl,
                    imageUrls: encodeImageUrls([selectedUrl]),
                    selectedIndex: 0,
                    description: selectedDescription,
                    descriptions: JSON.stringify([selectedDescription]),
                }
            })
        } else {
            // 只是选择，不确认
            await prisma.globalCharacterAppearance.update({
                where: { id: appearance.id },
                data: { selectedIndex: imageIndex }
            })
        }

        return NextResponse.json({ success: true })

    } else if (type === 'location') {
        const location = await prisma.globalLocation.findFirst({
            where: { id, userId: session.user.id },
            include: { images: { orderBy: { imageIndex: 'asc' } } }
        })

        if (!location) {
            throw new ApiError('NOT_FOUND')
        }

        const images = location.images || []
        const selectedImg = images.find((img) => img.isSelected)
        const confirmIndex = imageIndex ?? selectedImg?.imageIndex

        if (confirm && confirmIndex !== null && confirmIndex !== undefined) {
            // 确认选择：只保留选中的图片，删除其他候选
            const targetImage = images.find((img) => img.imageIndex === confirmIndex)
            if (!targetImage) {
                throw new ApiError('NOT_FOUND')
            }

            // 从存储中删除未选中的图片
            const imagesToDelete = images.filter((img) => img.id !== targetImage.id)
            for (const img of imagesToDelete) {
                if (img.imageUrl) {
                    const key = await resolveStorageKeyFromMediaValue(img.imageUrl)
                    if (key) {
                        try { await deleteObject(key) } catch { _ulogWarn('Failed to delete image:', key) }
                    }
                }
            }

            // 在事务中更新数据库
            await prisma.$transaction(async (tx) => {
                // 删除未选中的图片记录
                await tx.globalLocationImage.deleteMany({
                    where: { locationId: id!, id: { not: targetImage.id } }
                })
                // 将选中图片的 imageIndex 重置为 0
                await tx.globalLocationImage.update({
                    where: { id: targetImage.id },
                    data: { imageIndex: 0, isSelected: true }
                })
            })
        } else {
            // 只是选择，不确认
            await prisma.globalLocationImage.updateMany({
                where: { locationId: id },
                data: { isSelected: false }
            })

            if (imageIndex !== null && imageIndex !== undefined) {
                const targetImage = images.find((img) => img.imageIndex === imageIndex)
                if (targetImage) {
                    await prisma.globalLocationImage.update({
                        where: { id: targetImage.id },
                        data: { isSelected: true }
                    })
                }
            }
        }

        return NextResponse.json({ success: true })

    } else {
        throw new ApiError('INVALID_PARAMS')
    }
})

