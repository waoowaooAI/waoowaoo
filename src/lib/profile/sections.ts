export const PROFILE_SECTIONS = ['apiConfig', 'stylePresets', 'billing'] as const

export type ProfileSection = typeof PROFILE_SECTIONS[number]

export const DEFAULT_PROFILE_SECTION: ProfileSection = 'apiConfig'

export function isProfileSection(value: string): value is ProfileSection {
  return PROFILE_SECTIONS.includes(value as ProfileSection)
}

export function readProfileSectionParam(value: string | null): ProfileSection {
  if (value === null) {
    return DEFAULT_PROFILE_SECTION
  }

  if (isProfileSection(value)) {
    return value
  }

  throw new Error(`Unsupported profile section: ${value}`)
}
