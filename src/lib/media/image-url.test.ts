import { describe, expect, it } from 'vitest'
import { resolveOriginalImageUrl, toDisplayImageUrl, unwrapNextImageUrl } from './image-url'

describe('image-url helpers', () => {
  it('unwraps next/image nested url', () => {
    const input = '/_next/image?url=%2Fapi%2Fcos%2Fsign%3Fkey%3Dimages%252Ffoo.png&w=640&q=75'
    expect(unwrapNextImageUrl(input)).toBe('/api/cos/sign?key=images/foo.png')
  })

  it('maps storage key to display signing route', () => {
    expect(toDisplayImageUrl('images/a.png')).toBe('/api/cos/sign?key=images%2Fa.png')
  })

  it('resolves original url from next/image and keeps sign route normalized', () => {
    const input = '/_next/image?url=%2Fapi%2Fcos%2Fsign%3Fkey%3Dimages%252Fa.png&w=1080&q=75'
    expect(resolveOriginalImageUrl(input)).toBe('/api/cos/sign?key=images%2Fa.png')
  })

  it('returns null for empty values', () => {
    expect(toDisplayImageUrl('')).toBeNull()
    expect(resolveOriginalImageUrl(null)).toBeNull()
  })
})
