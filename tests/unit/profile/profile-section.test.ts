import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PROFILE_SECTION,
  PROFILE_SECTIONS,
  readProfileSectionParam,
} from '@/lib/profile/sections'

describe('profile section routing', () => {
  it('keeps billing records as the final settings center section', () => {
    expect(PROFILE_SECTIONS).toEqual(['apiConfig', 'stylePresets', 'billing'])
  })

  it('uses api config when the section query is absent', () => {
    expect(readProfileSectionParam(null)).toBe(DEFAULT_PROFILE_SECTION)
  })

  it('rejects unknown section query values instead of hiding them behind a fallback', () => {
    expect(() => readProfileSectionParam('legacyBilling')).toThrow('Unsupported profile section')
  })
})
