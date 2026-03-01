import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const getMediaObjectByPublicIdMock = vi.hoisted(() => vi.fn())
const readFileMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/media/service', () => ({
  getMediaObjectByPublicId: getMediaObjectByPublicIdMock,
}))

vi.mock('@/lib/cos', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/cos')>()
  return {
    ...actual,
    isLocalStorage: true,
    getLocalFilePath: (key: string) => `/tmp/uploads/${key}`,
    getLocalUploadDirAbs: () => '/tmp/uploads',
  }
})

vi.mock('fs/promises', () => ({
  default: { readFile: readFileMock },
  readFile: readFileMock,
}))

describe('GET /m/[publicId] - 本地存储不 fetch 自身 API（回归：ECONNREFUSED）', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    readFileMock.mockResolvedValue(Buffer.from('fake-image-bytes'))
    getMediaObjectByPublicIdMock.mockResolvedValue({
      id: 'media-1',
      publicId: 'm_abc',
      storageKey: 'images/foo.png',
      sha256: null,
      mimeType: 'image/png',
      sizeBytes: 18,
      updatedAt: '2025-01-01T00:00:00.000Z',
    })
  })

  it('本地存储时从磁盘读取并返回 200，不发起 fetch', async () => {
    const { GET } = await import('@/app/m/[publicId]/route')
    const req = new NextRequest('http://localhost:3000/m/m_abc')
    const res = await GET(req, { params: Promise.resolve({ publicId: 'm_abc' }) })

    expect(res.status).toBe(200)
    const body = await res.arrayBuffer()
    expect(new Uint8Array(body)).toEqual(new Uint8Array(Buffer.from('fake-image-bytes')))
    expect(res.headers.get('Content-Type')).toBe('image/png')
    expect(res.headers.get('ETag')).toBeTruthy()
    expect(readFileMock).toHaveBeenCalledTimes(1)
    const readPath = readFileMock.mock.calls[0][0] as string
    expect(readPath).toContain('uploads')
    expect(readPath).toContain('images')
    expect(readPath).toContain('foo.png')
  })
})
