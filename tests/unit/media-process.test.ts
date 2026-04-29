import { beforeEach, describe, expect, it, vi } from 'vitest'

const storageMock = vi.hoisted(() => ({
  downloadAndUploadImage: vi.fn(),
  downloadAndUploadVideo: vi.fn(),
  generateUniqueKey: vi.fn(),
  toFetchableUrl: vi.fn(),
  uploadObject: vi.fn(),
}))

vi.mock('@/lib/storage', () => storageMock)

import { processMediaResult } from '@/lib/media-process'

describe('processMediaResult', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = vi.fn() as unknown as typeof fetch
  })

  it('uses downloadAndUploadImage for image URL sources', async () => {
    storageMock.generateUniqueKey.mockReturnValueOnce('images/panel-1.jpg')
    storageMock.downloadAndUploadImage.mockResolvedValueOnce('images/uploaded-panel-1.jpg')

    const result = await processMediaResult({
      source: 'https://example.com/image.png',
      type: 'image',
      keyPrefix: 'panel',
      targetId: '1',
    })

    expect(storageMock.downloadAndUploadImage).toHaveBeenCalledWith('https://example.com/image.png', 'images/panel-1.jpg', 3)
    expect(result).toBe('images/uploaded-panel-1.jpg')
    expect(storageMock.uploadObject).not.toHaveBeenCalled()
  })

  it('uploads data: URL sources directly', async () => {
    storageMock.generateUniqueKey.mockReturnValueOnce('images/data-1.jpg')
    storageMock.uploadObject.mockResolvedValueOnce('images/uploaded-data-1.jpg')

    const result = await processMediaResult({
      source: 'data:image/png;base64,aGVsbG8=',
      type: 'image',
      keyPrefix: 'panel',
      targetId: 'data-1',
    })

    expect(storageMock.downloadAndUploadImage).not.toHaveBeenCalled()
    expect(storageMock.uploadObject).toHaveBeenCalledTimes(1)
    expect(result).toBe('images/uploaded-data-1.jpg')
  })

  it('throws when downloading non-video URL sources returns non-2xx', async () => {
    storageMock.generateUniqueKey.mockReturnValueOnce('voice/line-1.mp3')
    storageMock.toFetchableUrl.mockImplementationOnce((url) => url)

    ;(globalThis.fetch as unknown as { mockResolvedValueOnce: (v: unknown) => void }).mockResolvedValueOnce(
      new Response('nope', { status: 404, statusText: 'Not Found' }),
    )

    await expect(processMediaResult({
      source: 'https://example.com/audio.mp3',
      type: 'audio',
      keyPrefix: 'voice',
      targetId: 'line-1',
    })).rejects.toThrow(/Failed to download audio: 404/i)
  })
})
