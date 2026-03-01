import { NextRequest, NextResponse } from 'next/server'
import * as fs from 'fs/promises'
import * as path from 'path'
import { getSignedUrl, toFetchableUrl, isLocalStorage, getLocalFilePath, getLocalUploadDirAbs } from '@/lib/cos'
import { getMediaObjectByPublicId } from '@/lib/media/service'

export const runtime = 'nodejs'

function buildEtag(media: { sha256?: string | null; id: string; updatedAt?: string | Date | null }) {
  if (media.sha256) return `"${media.sha256}"`
  const updated =
    media.updatedAt instanceof Date ? String(media.updatedAt.getTime()) : (media.updatedAt ?? '0')
  return `W/"media-${media.id}-${updated}"`
}

/** 解析 Range 头，返回 [start, end]（含），end 可为 undefined 表示到末尾 */
function parseRange(rangeHeader: string | null, totalLength: number): { start: number; end: number } | null {
  if (!rangeHeader?.startsWith('bytes=')) return null
  const part = rangeHeader.replace('bytes=', '').trim().split('-')
  const start = part[0] ? parseInt(part[0], 10) : 0
  const end = part[1] ? parseInt(part[1], 10) : totalLength - 1
  if (Number.isNaN(start) || start < 0 || end < start || end >= totalLength) return null
  return { start, end }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ publicId: string }> },
) {
  const { publicId } = await context.params
  const media = await getMediaObjectByPublicId(publicId)

  if (!media) {
    return NextResponse.json({ error: 'Media not found' }, { status: 404 })
  }
  if (!media.storageKey) {
    return NextResponse.json({ error: 'Media storage key missing' }, { status: 500 })
  }

  const etag = buildEtag({
    id: media.id,
    sha256: media.sha256,
    updatedAt: media.updatedAt || null,
  })

  const ifNoneMatch = request.headers.get('if-none-match')
  if (ifNoneMatch && ifNoneMatch === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: {
        ETag: etag,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  }

  const contentType = media.mimeType || 'application/octet-stream'

  // 本地存储：直接读盘，避免 fetch 自身 API 导致 ECONNREFUSED
  if (isLocalStorage) {
    const localPath = getLocalFilePath(media.storageKey)
    if (!localPath) {
      return NextResponse.json({ error: 'Local path not available' }, { status: 500 })
    }
    const normalizedPath = path.normalize(path.resolve(localPath))
    const uploadDirAbs = path.normalize(getLocalUploadDirAbs()) + path.sep
    if (!normalizedPath.startsWith(uploadDirAbs)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }
    try {
      const buffer = await fs.readFile(normalizedPath)
      const totalLength = buffer.length
      const range = parseRange(request.headers.get('range'), totalLength)

      const headers = new Headers()
      headers.set('Content-Type', contentType)
      headers.set('Cache-Control', 'public, max-age=31536000, immutable')
      headers.set('ETag', etag)
      if (contentType.startsWith('video/') || contentType.startsWith('audio/')) {
        headers.set('Accept-Ranges', 'bytes')
      }

      if (range) {
        const body = buffer.subarray(range.start, range.end + 1)
        headers.set('Content-Length', String(body.length))
        headers.set('Content-Range', `bytes ${range.start}-${range.end}/${totalLength}`)
        return new Response(new Uint8Array(body), { status: 206, headers })
      }

      headers.set('Content-Length', String(totalLength))
      return new Response(new Uint8Array(buffer), { status: 200, headers })
    } catch (error: unknown) {
      const code = typeof error === 'object' && error !== null && 'code' in error
        ? (error as { code?: string }).code
        : undefined
      if (code === 'ENOENT') {
        return NextResponse.json({ error: 'File not found' }, { status: 404 })
      }
      throw error
    }
  }

  // 云端存储：通过 fetch 拉取
  const fetchUrl = toFetchableUrl(getSignedUrl(media.storageKey))
  const range = request.headers.get('range')

  const upstream = await fetch(fetchUrl, {
    headers: range ? { Range: range } : undefined,
  })

  if (!upstream.ok) {
    const status = upstream.status === 404 ? 404 : 502
    return NextResponse.json({ error: 'Failed to fetch media' }, { status })
  }

  const contentLength = upstream.headers.get('content-length')
  const contentRange = upstream.headers.get('content-range')
  const acceptRanges = upstream.headers.get('accept-ranges') || (contentType.startsWith('video/') ? 'bytes' : null)

  const headers = new Headers()
  headers.set('Content-Type', contentType)
  headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  headers.set('ETag', etag)
  if (contentLength) headers.set('Content-Length', contentLength)
  if (contentRange) headers.set('Content-Range', contentRange)
  if (acceptRanges) headers.set('Accept-Ranges', acceptRanges)

  return new Response(upstream.body, {
    status: upstream.status === 206 ? 206 : 200,
    headers,
  })
}

export async function HEAD(
  request: NextRequest,
  context: { params: Promise<{ publicId: string }> },
) {
  const { publicId } = await context.params
  const media = await getMediaObjectByPublicId(publicId)
  if (!media) {
    return NextResponse.json({ error: 'Media not found' }, { status: 404 })
  }

  const etag = buildEtag({
    id: media.id,
    sha256: media.sha256,
    updatedAt: media.updatedAt || null,
  })

  const headers = new Headers()
  headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  headers.set('ETag', etag)
  if (media.mimeType) headers.set('Content-Type', media.mimeType)
  if (media.sizeBytes != null) headers.set('Content-Length', String(media.sizeBytes))
  return new Response(null, { status: 200, headers })
}
