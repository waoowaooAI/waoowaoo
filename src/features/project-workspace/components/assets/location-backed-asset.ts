import type { Location, Prop } from '@/types/project'

export function canGenerateLocationBackedAsset(
  asset: Location | Prop,
  assetType: 'location' | 'prop',
): boolean {
  if (assetType === 'location' && asset.summary && asset.summary.trim().length > 0) {
    return true
  }

  return (asset.images ?? []).some((image) =>
    typeof image.description === 'string' && image.description.trim().length > 0,
  )
}

export function resolveLocationBackedGenerateType(
  assetType: 'location' | 'prop',
): 'location' | 'prop' {
  return assetType
}
