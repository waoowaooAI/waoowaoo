import { describe, expect, it } from 'vitest'
import { getAllClipsAssets, parseClipAssets } from '@/features/project-workspace/components/script-view/clip-asset-utils'

describe('clip asset utils', () => {
  it('parses prop names from clip JSON payloads', () => {
    const parsed = parseClipAssets({
      characters: '[{"name":"小雨","appearance":"初始形象"}]',
      location: '天台',
      props: '["青铜匕首","录音笔"]',
    })

    expect(Array.from(parsed.propNames)).toEqual(['青铜匕首', '录音笔'])
  })

  it('aggregates prop names across clips', () => {
    const all = getAllClipsAssets([
      { props: '["青铜匕首"]' },
      { props: '["录音笔","红绳手链"]' },
    ])

    expect(Array.from(all.allPropNames)).toEqual(['青铜匕首', '录音笔', '红绳手链'])
  })
})
