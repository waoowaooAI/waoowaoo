import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  OutboundImageNormalizeError,
  normalizeReferenceImagesForGeneration,
  normalizeToBase64ForGeneration,
  normalizeToOriginalMediaUrl,
  sanitizeImageInputsForTaskPayload,
} from './outbound-image'
import { resolveStorageKeyFromMediaValue } from '@/lib/media/service'
import { lookup } from 'node:dns/promises'

vi.mock('@/lib/storage', () => ({
  getSignedUrl: vi.fn((key: string) => `/signed/${key}`),
  toFetchableUrl: vi.fn((value: string) => (
    value.startsWith('/') ? `http://localhost:3000${value}` : value
  )),
}))

vi.mock('@/lib/media/service', () => ({
  resolveStorageKeyFromMediaValue: vi.fn(),
}))

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(),
}))

describe('outbound-image normalization', () => {
  const fetchMock = vi.fn()
  const resolveStorageKeyMock = vi.mocked(resolveStorageKeyFromMediaValue)
  const dnsLookupMock = vi.mocked(lookup)

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', fetchMock)

    resolveStorageKeyMock.mockImplementation(async (value: unknown) => {
      if (value === '/m/pub-1') return 'images/from-media.png'
      return null
    })

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'image/png' }),
      arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer,
    } as unknown as Response)

    dnsLookupMock.mockResolvedValue(
      { address: '93.184.216.34', family: 4 } as unknown as { address: string; family: number },
    )
  })

  it('keeps data url unchanged', async () => {
    const dataUrl = 'data:image/png;base64,AAAA'
    expect(await normalizeToOriginalMediaUrl(dataUrl)).toBe(dataUrl)
  })

  it('throws structured error on empty input', async () => {
    await expect(normalizeToOriginalMediaUrl('')).rejects.toBeInstanceOf(OutboundImageNormalizeError)
    await expect(normalizeToOriginalMediaUrl('')).rejects.toMatchObject({
      code: 'OUTBOUND_IMAGE_EMPTY_INPUT',
      stage: 'normalize_original',
    })
  })

  it('unwraps next/image and resolves /m route to signed source', async () => {
    const input = '/_next/image?url=%2Fm%2Fpub-1&w=640&q=75'
    const normalized = await normalizeToOriginalMediaUrl(input)
    expect(normalized).toBe('http://localhost:3000/signed/images/from-media.png')
  })

  it('fails explicitly when /m route cannot be resolved to storage key', async () => {
    await expect(normalizeToOriginalMediaUrl('/m/missing-id')).rejects.toMatchObject({
      code: 'OUTBOUND_IMAGE_MEDIA_ROUTE_UNRESOLVED',
      stage: 'normalize_original',
    })
  })

  it('signs storage key inputs', async () => {
    const normalized = await normalizeToOriginalMediaUrl('images/direct.png')
    expect(normalized).toBe('http://localhost:3000/signed/images/direct.png')
  })

  it('normalizes api relative path to absolute fetchable url', async () => {
    const normalized = await normalizeToOriginalMediaUrl('/api/files/images%2Fa.png')
    expect(normalized).toBe('http://localhost:3000/api/files/images%2Fa.png')
  })

  it('fails explicitly on unsupported root-relative input', async () => {
    await expect(normalizeToOriginalMediaUrl('/foo/bar.png')).rejects.toMatchObject({
      code: 'OUTBOUND_IMAGE_UNSUPPORTED_INPUT',
      stage: 'normalize_original',
    })
  })

  it('keeps http input as-is', async () => {
    const input = 'https://example.com/a.png'
    expect(await normalizeToOriginalMediaUrl(input)).toBe(input)
  })

  it('rejects private ip outbound urls as unsafe', async () => {
    await expect(normalizeToOriginalMediaUrl('http://127.0.0.1/a.png')).rejects.toMatchObject({
      code: 'OUTBOUND_IMAGE_UNSAFE_URL',
      stage: 'normalize_original',
    })
  })

  it('rejects outbound redirect to private ip', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 302,
        headers: new Headers({ location: 'http://127.0.0.1/secret.png' }),
        arrayBuffer: async () => new ArrayBuffer(0),
      } as unknown as Response)

    await expect(normalizeToBase64ForGeneration('https://example.com/a.png')).rejects.toMatchObject({
      code: 'OUTBOUND_IMAGE_UNSAFE_URL',
      stage: 'normalize_base64',
    })
  })

  it('converts normalized source to data url base64 payload', async () => {
    const dataUrl = await normalizeToBase64ForGeneration('images/direct.png')
    expect(dataUrl).toBe('data:image/png;base64,AQID')
  })

  it('sniffs png mime when upstream returns application/octet-stream', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/octet-stream' }),
      arrayBuffer: async () => Uint8Array.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0x00, 0x00, 0x00, 0x0d,
      ]).buffer,
    } as Response)

    const dataUrl = await normalizeToBase64ForGeneration('images/direct.png')
    expect(dataUrl).toBe('data:image/png;base64,iVBORw0KGgoAAAAN')
  })

  it('sniffs jpeg mime when upstream returns application/octet-stream', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/octet-stream' }),
      arrayBuffer: async () => Uint8Array.from([
        0xff, 0xd8, 0xff, 0xe0,
        0x00, 0x10, 0x4a, 0x46,
        0x49, 0x46, 0x00, 0x01,
      ]).buffer,
    } as Response)

    const dataUrl = await normalizeToBase64ForGeneration('images/direct.jpg')
    expect(dataUrl).toBe('data:image/jpeg;base64,/9j/4AAQSkZJRgAB')
  })

  it('normalizes references with dedupe and failure isolation', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/api/bad.png')) {
        return {
          ok: false,
          status: 404,
          headers: new Headers(),
          arrayBuffer: async () => new ArrayBuffer(0),
        } as Response
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'image/png' }),
        arrayBuffer: async () => Uint8Array.from([7, 8, 9]).buffer,
      } as Response
    })

    const normalized = await normalizeReferenceImagesForGeneration([
      'images/direct.png',
      'images/direct.png',
      '/api/bad.png',
    ])
    expect(normalized).toHaveLength(1)
    expect(normalized[0]).toBe('data:image/png;base64,BwgJ')
  })

  it('reports structured issue and fails explicitly when all references fail', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers(),
      arrayBuffer: async () => new ArrayBuffer(0),
    } as Response)

    const issues: Array<{
      code: string
      stage: string
      message: string
      input: string
      index: number
    }> = []

    await expect(
      normalizeReferenceImagesForGeneration(['images/bad.png'], {
        onIssue: (issue) => issues.push(issue),
      }),
    ).rejects.toMatchObject({
      code: 'OUTBOUND_IMAGE_REFERENCE_ALL_FAILED',
      stage: 'normalize_reference',
    })
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({
      code: 'OUTBOUND_IMAGE_FETCH_FAILED',
      stage: 'normalize_base64',
      input: 'images/bad.png',
      index: 0,
    })
  })

  it('sanitizes task payload urls and reports input issues', () => {
    const result = sanitizeImageInputsForTaskPayload([
      '/_next/image?url=images%2Fa.png&w=1080&q=75',
      '',
      123,
      '/relative/path.png',
    ])

    expect(result.normalized).toEqual(['images/a.png'])
    expect(result.issues.map((item) => item.reason)).toEqual([
      'next_image_unwrapped',
      'empty_value_skipped',
      'non_string_skipped',
      'relative_path_rejected',
    ])
  })
})
