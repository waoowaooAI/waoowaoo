import { describe, expect, it } from 'vitest'
import { parseReferenceImages, readBoolean, readString } from '@/lib/workers/handlers/reference-to-character-helpers'

describe('reference-to-character helpers', () => {
  it('parses and trims single reference image', () => {
    expect(parseReferenceImages({ referenceImageUrl: ' https://x/a.png ' })).toEqual(['https://x/a.png'])
  })

  it('parses multi reference images and truncates to max 5', () => {
    expect(
      parseReferenceImages({
        referenceImageUrls: [
          'https://x/1.png',
          'https://x/2.png',
          'https://x/3.png',
          'https://x/4.png',
          'https://x/5.png',
          'https://x/6.png',
        ],
      }),
    ).toEqual([
      'https://x/1.png',
      'https://x/2.png',
      'https://x/3.png',
      'https://x/4.png',
      'https://x/5.png',
    ])
  })

  it('filters empty values', () => {
    expect(
      parseReferenceImages({
        referenceImageUrls: [' ', '\n', 'https://x/ok.png'],
      }),
    ).toEqual(['https://x/ok.png'])
  })

  it('readString trims and normalizes invalid values', () => {
    expect(readString(' abc ')).toBe('abc')
    expect(readString(1)).toBe('')
    expect(readString(null)).toBe('')
  })

  it('readBoolean supports boolean/number/string flags', () => {
    expect(readBoolean(true)).toBe(true)
    expect(readBoolean(1)).toBe(true)
    expect(readBoolean('true')).toBe(true)
    expect(readBoolean('YES')).toBe(true)
    expect(readBoolean('on')).toBe(true)
    expect(readBoolean('0')).toBe(false)
    expect(readBoolean(false)).toBe(false)
    expect(readBoolean(0)).toBe(false)
  })
})
