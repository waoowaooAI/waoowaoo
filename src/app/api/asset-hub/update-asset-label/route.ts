import { logError as _ulogError } from '@/lib/logging/core'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { uploadToCOS, getSignedUrl, toFetchableUrl, generateUniqueKey } from '@/lib/cos'
import { decodeImageUrlsFromDb, encodeImageUrls } from '@/lib/contracts/image-urls-contract'
import { resolveStorageKeyFromMediaValue } from '@/lib/media/service'
import sharp from 'sharp'
import { initializeFonts, createLabelSVG } from '@/lib/fonts'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

/**
 * POST /api/asset-hub/update-asset-label
 * 更新资产中心图片上的黑边标识符（修改名字后调用）
 */
export const POST = apiHandler(async (request: NextRequest) => {
    await initializeFonts()

    const authResult = await requireUserAuth()
    if (isErrorResponse(authResult)) return authResult
    const { session } = authResult

    const body = await request.json()
    const { type, id, newName, appearanceIndex } = body

    if (!type || !id || !newName) {
        throw new ApiError('INVALID_PARAMS')
    }

    if (type === 'character') {
        const character = await prisma.globalCharacter.findUnique({
            where: { id },
            include: { appearances: true },
        })

        if (!character || character.userId !== session.user.id) {
            throw new ApiError('NOT_FOUND')
        }

        const updatePromises = character.appearances.map(async (appearance) => {
            if (appearanceIndex !== undefined && appearance.appearanceIndex !== appearanceIndex) {
                return null
            }

            let imageUrls = decodeImageUrlsFromDb(appearance.imageUrls, 'globalCharacterAppearance.imageUrls')
            if (imageUrls.length === 0 && appearance.imageUrl) {
                imageUrls = [appearance.imageUrl]
            }
            if (imageUrls.length === 0) return null

            const newLabelText = `${newName} - ${appearance.changeReason}`
            const newImageUrls: string[] = await Promise.all(
                imageUrls.map(async (url, i) => {
                    if (!url) return ''
                    try {
                        return await updateImageLabel(url, newLabelText)
                    } catch (e) {
                        _ulogError(`Failed to update label for global character image ${i}:`, e)
                        return url
                    }
                })
            )

            const firstUrl = newImageUrls.find((u) => !!u) || null

            await prisma.globalCharacterAppearance.update({
                where: { id: appearance.id },
                data: {
                    imageUrls: encodeImageUrls(newImageUrls),
                    imageUrl: firstUrl,
                },
            })

            return { appearanceIndex: appearance.appearanceIndex, imageUrls: newImageUrls }
        })

        const results = await Promise.all(updatePromises)
        return NextResponse.json({ success: true, results: results.filter((r) => r !== null) })
    }

    if (type === 'location') {
        const location = await prisma.globalLocation.findUnique({
            where: { id },
            include: { images: true },
        })

        if (!location || location.userId !== session.user.id) {
            throw new ApiError('NOT_FOUND')
        }

        const updatePromises = location.images.map(async (image) => {
            if (!image.imageUrl) return null

            try {
                const newImageUrl = await updateImageLabel(image.imageUrl, newName)

                await prisma.globalLocationImage.update({
                    where: { id: image.id },
                    data: { imageUrl: newImageUrl },
                })

                return { imageIndex: image.imageIndex, imageUrl: newImageUrl }
            } catch (e) {
                _ulogError(`Failed to update label for global location image ${image.imageIndex}:`, e)
                return null
            }
        })

        const results = await Promise.all(updatePromises)
        return NextResponse.json({ success: true, results: results.filter((r) => r !== null) })
    }

    throw new ApiError('INVALID_PARAMS')
})

/**
 * 更新图片的黑边标签
 * 生成新 COS key 上传，URL 变化后浏览器缓存失效，前端能立即看到新标签
 */
async function updateImageLabel(imageUrl: string, newLabelText: string): Promise<string> {
    const originalKey = await resolveStorageKeyFromMediaValue(imageUrl)
    if (!originalKey) {
        throw new Error(`无法归一化媒体 key: ${imageUrl}`)
    }
    const signedUrl = getSignedUrl(originalKey, 3600)

    const response = await fetch(toFetchableUrl(signedUrl))
    if (!response.ok) {
        throw new Error(`Failed to download image: ${response.status}`)
    }
    const buffer = Buffer.from(await response.arrayBuffer())

    const meta = await sharp(buffer).metadata()
    const w = meta.width || 2160
    const h = meta.height || 2160

    const fontSize = Math.floor(h * 0.04)
    const pad = Math.floor(fontSize * 0.5)
    const barH = fontSize + pad * 2

    const croppedBuffer = await sharp(buffer)
        .extract({ left: 0, top: barH, width: w, height: h - barH })
        .toBuffer()

    const svg = await createLabelSVG(w, barH, fontSize, pad, newLabelText)

    const processed = await sharp(croppedBuffer)
        .extend({ top: barH, bottom: 0, left: 0, right: 0, background: { r: 0, g: 0, b: 0, alpha: 1 } })
        .composite([{ input: svg, top: 0, left: 0 }])
        .jpeg({ quality: 90, mozjpeg: true })
        .toBuffer()

    // 生成新 key，使 URL 发生变化，强制浏览器绕过缓存
    const newKey = generateUniqueKey('labeled-rename', 'jpg')
    await uploadToCOS(processed, newKey)
    return newKey
}
