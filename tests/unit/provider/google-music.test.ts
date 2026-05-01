import { describe, expect, it } from 'vitest'
import { extractGoogleMusicResult } from '@/lib/ai-providers/google/music'

describe('google music adapter', () => {
  it('extracts the first audio inlineData part and preserves text metadata', () => {
    const result = extractGoogleMusicResult({
      candidates: [
        {
          finishReason: 'STOP',
          content: {
            parts: [
              { text: 'metadata notes' },
              { inlineData: { mimeType: 'audio/mpeg', data: 'ZmFrZS1tcDM=' } },
            ],
          },
        },
      ],
    })

    expect(result.audioBase64).toBe('ZmFrZS1tcDM=')
    expect(result.audioMimeType).toBe('audio/mpeg')
    expect(result.textMetadata).toBe('metadata notes')
    expect(result.finishReason).toBe('STOP')
  })

  it('fails explicitly when safety blocks the response', () => {
    expect(() => extractGoogleMusicResult({
      candidates: [
        {
          finishReason: 'SAFETY',
          content: { parts: [{ text: 'blocked' }] },
        },
      ],
    })).toThrow('GOOGLE_MUSIC_BLOCKED:SAFETY')
  })

  it('fails explicitly when no audio part is returned', () => {
    expect(() => extractGoogleMusicResult({
      candidates: [
        {
          finishReason: 'STOP',
          content: { parts: [{ text: 'no audio' }] },
        },
      ],
    })).toThrow('GOOGLE_MUSIC_EMPTY_RESPONSE: no audio inlineData returned')
  })
})
