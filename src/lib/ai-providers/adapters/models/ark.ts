export const ARK_IMAGE_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9', '9:21'] as const
export const ARK_VIDEO_RATIOS = ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', 'adaptive'] as const
export const ARK_IMAGE_RESOLUTIONS = ['4K', '3K'] as const

export const ARK_VIDEO_SPECS: Record<string, { durationMin: number; durationMax: number; resolutions: readonly string[] }> = {
  'doubao-seedance-1-0-pro-fast-251015': { durationMin: 2, durationMax: 12, resolutions: ['480p', '720p', '1080p'] },
  'doubao-seedance-1-0-pro-250528': { durationMin: 2, durationMax: 12, resolutions: ['480p', '720p', '1080p'] },
  'doubao-seedance-1-0-lite-i2v-250428': { durationMin: 2, durationMax: 12, resolutions: ['480p', '720p', '1080p'] },
  'doubao-seedance-1-5-pro-251215': { durationMin: 4, durationMax: 12, resolutions: ['480p', '720p', '1080p'] },
  'doubao-seedance-2-0-260128': { durationMin: 4, durationMax: 15, resolutions: ['480p', '720p'] },
  'doubao-seedance-2-0-fast-260128': { durationMin: 4, durationMax: 15, resolutions: ['480p', '720p'] },
}
