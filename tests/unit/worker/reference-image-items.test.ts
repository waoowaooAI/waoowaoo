import { beforeEach, describe, expect, it, vi } from 'vitest'

const outboundMock = vi.hoisted(() => ({
  normalizeOptionalReferenceImagesForGeneration: vi.fn(async (input: string[]) => [`normalized:${input[0]}`]),
}))

vi.mock('@/lib/media/outbound-image', () => outboundMock)

import {
  normalizeReferenceImageItemsForGeneration,
  type ReferenceImageItem,
} from '@/lib/workers/handlers/image-task-handler-shared'

describe('reference image item normalization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    outboundMock.normalizeOptionalReferenceImagesForGeneration.mockImplementation(async (input: string[]) => [`normalized:${input[0]}`])
  })

  it('returns normalized images and continuous image-number mappings', async () => {
    const items: ReferenceImageItem[] = [
      { url: 'https://example.com/sketch.png', role: 'sketch', name: 'storyboard sketch' },
      { url: 'https://example.com/hero.png', role: 'character', name: 'Hero', appearance: 'default' },
      { url: 'https://example.com/location.png', role: 'location', name: 'Old Town' },
    ]

    const result = await normalizeReferenceImageItemsForGeneration(items, { locale: 'zh' })

    expect(result.referenceImages).toEqual([
      'normalized:https://example.com/sketch.png',
      'normalized:https://example.com/hero.png',
      'normalized:https://example.com/location.png',
    ])
    expect(result.referenceImagesMap).toEqual([
      { image_no: '图 1', role: 'sketch', name: '分镜草图' },
      { image_no: '图 2', role: 'character', name: 'Hero', appearance: 'default' },
      { image_no: '图 3', role: 'location', name: 'Old Town' },
    ])
  })

  it('skips failed items and keeps later image numbers aligned with sent images', async () => {
    outboundMock.normalizeOptionalReferenceImagesForGeneration.mockImplementation(async (input: string[]) =>
      input[0].includes('bad') ? [] : [`normalized:${input[0]}`],
    )
    const items: ReferenceImageItem[] = [
      { url: 'https://example.com/hero.png', role: 'character', name: 'Hero' },
      { url: 'https://example.com/bad.png', role: 'character', name: 'Broken' },
      { url: 'https://example.com/location.png', role: 'location', name: 'Old Town' },
    ]

    const result = await normalizeReferenceImageItemsForGeneration(items, { locale: 'zh' })

    expect(result.referenceImages).toEqual([
      'normalized:https://example.com/hero.png',
      'normalized:https://example.com/location.png',
    ])
    expect(result.referenceImagesMap).toEqual([
      { image_no: '图 1', role: 'character', name: 'Hero' },
      { image_no: '图 2', role: 'location', name: 'Old Town' },
    ])
  })

  it('deduplicates repeated urls so mappings match the actual image array', async () => {
    const items: ReferenceImageItem[] = [
      { url: 'https://example.com/hero.png', role: 'character', name: 'Hero' },
      { url: ' https://example.com/hero.png ', role: 'character', name: 'Hero Duplicate' },
      { url: 'https://example.com/location.png', role: 'location', name: 'Old Town' },
    ]

    const result = await normalizeReferenceImageItemsForGeneration(items, { locale: 'en' })

    expect(outboundMock.normalizeOptionalReferenceImagesForGeneration).toHaveBeenCalledTimes(2)
    expect(result.referenceImages).toEqual([
      'normalized:https://example.com/hero.png',
      'normalized:https://example.com/location.png',
    ])
    expect(result.referenceImagesMap).toEqual([
      { image_no: 'Image 1', role: 'character', name: 'Hero' },
      { image_no: 'Image 2', role: 'location', name: 'Old Town' },
    ])
  })
})
