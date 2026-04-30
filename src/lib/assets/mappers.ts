import {
  createIdleTaskState,
  type AssetRenderSummary,
  type AssetSummary,
  type AssetTaskRef,
  type AssetVariantSummary,
  type CharacterAssetSummary,
  type LocationAssetSummary,
  type PropAssetSummary,
  type VoiceAssetSummary,
} from '@/lib/assets/contracts'
import { getAssetKindRegistration } from '@/lib/assets/kinds/registry'
import type { MediaRef } from '@/types/project'

type CharacterAppearanceRecord = {
  id: string
  appearanceIndex: number
  changeReason: string
  description: string | null
  imageUrl: string | null
  media?: MediaRef | null
  imageUrls: string[]
  imageMedias?: MediaRef[]
  selectedIndex: number | null
  previousImageUrl: string | null
  previousMedia?: MediaRef | null
  previousImageUrls?: string[]
  previousImageMedias?: MediaRef[]
}

type ProjectCharacterRecord = {
  id: string
  name: string
  introduction?: string | null
  profileData?: string | null
  voiceType?: 'custom' | 'qwen-designed' | 'uploaded' | null
  voiceId?: string | null
  customVoiceUrl?: string | null
  media?: MediaRef | null
  profileConfirmed?: boolean | null
  appearances: CharacterAppearanceRecord[]
}

type GlobalCharacterRecord = {
  id: string
  name: string
  folderId: string | null
  customVoiceUrl: string | null
  media?: MediaRef | null
  appearances: Array<{
    id: string
    appearanceIndex: number
    changeReason: string
    description: string | null
    imageUrl: string | null
    media?: MediaRef | null
    imageUrls: string[]
    imageMedias?: MediaRef[]
    selectedIndex: number | null
    previousImageUrl: string | null
    previousMedia?: MediaRef | null
    previousImageUrls: string[]
    previousImageMedias?: MediaRef[]
  }>
}

type LocationImageRecord = {
  id: string
  imageIndex: number
  description: string | null
  imageUrl: string | null
  media?: MediaRef | null
  previousImageUrl: string | null
  previousMedia?: MediaRef | null
  isSelected: boolean
}

type ProjectLocationRecord = {
  id: string
  name: string
  summary: string | null
  images: LocationImageRecord[]
}

type GlobalLocationRecord = {
  id: string
  name: string
  summary: string | null
  folderId: string | null
  images: LocationImageRecord[]
}

type ProjectPropRecord = {
  id: string
  name: string
  summary: string | null
  images: LocationImageRecord[]
}

type GlobalPropRecord = {
  id: string
  name: string
  summary: string | null
  folderId: string | null
  images: LocationImageRecord[]
}

type GlobalVoiceRecord = {
  id: string
  name: string
  description: string | null
  voiceId: string | null
  voiceType: string
  customVoiceUrl: string | null
  media?: MediaRef | null
  voicePrompt: string | null
  gender: string | null
  language: string
  folderId: string | null
}

function createRender(params: {
  id: string
  index: number
  imageUrl: string | null
  media: MediaRef | null
  isSelected: boolean
  previousImageUrl: string | null
  previousMedia: MediaRef | null
  taskRefs: AssetTaskRef[]
}): AssetRenderSummary {
  return {
    ...params,
    taskState: createIdleTaskState(),
  }
}

function createVariant(params: {
  id: string
  index: number
  label: string
  description: string | null
  selectedRenderIndex: number | null
  renders: AssetRenderSummary[]
  taskRefs: AssetTaskRef[]
}): AssetVariantSummary {
  return {
    id: params.id,
    index: params.index,
    label: params.label,
    description: params.description,
    renders: params.renders,
    selectionState: {
      selectedRenderIndex: params.selectedRenderIndex,
    },
    taskRefs: params.taskRefs,
    taskState: createIdleTaskState(),
  }
}

export function mapProjectCharacterToAsset(character: ProjectCharacterRecord): CharacterAssetSummary {
  const registration = getAssetKindRegistration('character')
  const normalizedVoiceType = character.voiceType === 'custom'
    || character.voiceType === 'qwen-designed'
    || character.voiceType === 'uploaded'
    ? character.voiceType
    : null
  const variants = character.appearances.map((appearance) => {
    const imageMedias = appearance.imageMedias ?? []
    const previousImageMedias = appearance.previousImageMedias ?? []
    const renders = appearance.imageUrls.map((imageUrl, renderIndex) =>
      createRender({
        id: `${appearance.id}:${renderIndex}`,
        index: renderIndex,
        imageUrl,
        media: imageMedias[renderIndex] ?? null,
        isSelected: appearance.selectedIndex === renderIndex,
        previousImageUrl: appearance.previousImageUrls?.[renderIndex] ?? appearance.previousImageUrl ?? null,
        previousMedia: previousImageMedias[renderIndex] ?? appearance.previousMedia ?? null,
        taskRefs: [],
      }),
    )
    return createVariant({
      id: appearance.id,
      index: appearance.appearanceIndex,
      label: appearance.changeReason,
      description: appearance.description,
      selectedRenderIndex: appearance.selectedIndex,
      renders,
      taskRefs: [
        {
          targetType: 'CharacterAppearance',
          targetId: appearance.id,
          types: ['image_character', 'modify_asset_image', 'regenerate_group'],
        },
      ],
    })
  })

  return {
    id: character.id,
    scope: 'project',
    kind: 'character',
    family: 'visual',
    name: character.name,
    folderId: null,
    capabilities: registration.capabilities,
    taskRefs: [
      {
        targetType: 'CharacterAppearance',
        targetId: character.id,
        types: ['image_character', 'modify_asset_image', 'regenerate_group'],
      },
    ],
    taskState: createIdleTaskState(),
    variants,
    introduction: character.introduction ?? null,
    profileData: character.profileData ?? null,
    profileConfirmed: character.profileConfirmed ?? null,
    voice: {
      voiceType: normalizedVoiceType,
      voiceId: character.voiceId ?? null,
      customVoiceUrl: character.customVoiceUrl ?? null,
      media: character.media ?? null,
    },
  }
}

export function mapGlobalCharacterToAsset(character: GlobalCharacterRecord): CharacterAssetSummary {
  const registration = getAssetKindRegistration('character')
  const variants = character.appearances.map((appearance) => {
    const imageMedias = appearance.imageMedias ?? []
    const previousImageMedias = appearance.previousImageMedias ?? []
    const renders = appearance.imageUrls.map((imageUrl, renderIndex) =>
      createRender({
        id: `${appearance.id}:${renderIndex}`,
        index: renderIndex,
        imageUrl,
        media: imageMedias[renderIndex] ?? null,
        isSelected: appearance.selectedIndex === renderIndex,
        previousImageUrl: appearance.previousImageUrls[renderIndex] ?? appearance.previousImageUrl ?? null,
        previousMedia: previousImageMedias[renderIndex] ?? appearance.previousMedia ?? null,
        taskRefs: [
          {
            targetType: 'GlobalCharacterAppearance',
            targetId: `${character.id}:${appearance.appearanceIndex}:${renderIndex}`,
            types: ['asset_hub_modify'],
          },
        ],
      }),
    )
    return createVariant({
      id: appearance.id,
      index: appearance.appearanceIndex,
      label: appearance.changeReason,
      description: appearance.description,
      selectedRenderIndex: appearance.selectedIndex,
      renders,
      taskRefs: [
        {
          targetType: 'GlobalCharacterAppearance',
          targetId: appearance.id,
          types: ['asset_hub_image', 'asset_hub_modify', 'asset_hub_reference_to_character'],
        },
      ],
    })
  })

  return {
    id: character.id,
    scope: 'global',
    kind: 'character',
    family: 'visual',
    name: character.name,
    folderId: character.folderId,
    capabilities: registration.capabilities,
    taskRefs: [],
    taskState: createIdleTaskState(),
    variants,
    introduction: null,
    profileData: null,
    profileConfirmed: null,
    voice: {
      voiceType: null,
      voiceId: null,
      customVoiceUrl: character.customVoiceUrl,
      media: character.media ?? null,
    },
  }
}

function buildLocationVariants(
  scope: 'global' | 'project',
  assetId: string,
  images: LocationImageRecord[],
): AssetVariantSummary[] {
  return images.map((image) => {
    const targetType = scope === 'global' ? 'GlobalLocationImage' : 'LocationImage'
    const renderTaskRef: AssetTaskRef | null = scope === 'global'
      ? {
        targetType,
        targetId: `${assetId}:${image.imageIndex}`,
        types: ['asset_hub_modify'],
      }
      : null
    return createVariant({
      id: image.id,
      index: image.imageIndex,
      label: `Image ${image.imageIndex + 1}`,
      description: image.description,
      selectedRenderIndex: image.isSelected ? 0 : null,
      renders: [
        createRender({
          id: image.id,
          index: 0,
          imageUrl: image.imageUrl,
          media: image.media ?? null,
          isSelected: image.isSelected,
          previousImageUrl: image.previousImageUrl,
          previousMedia: image.previousMedia ?? null,
          taskRefs: renderTaskRef ? [renderTaskRef] : [],
        }),
      ],
      taskRefs: [
        {
          targetType,
          targetId: image.id,
          types: scope === 'global' ? ['asset_hub_modify'] : ['image_location', 'modify_asset_image', 'regenerate_group'],
        },
      ],
    })
  })
}

function mapLocationLikeProjectAsset(
  kind: 'location' | 'prop',
  asset: ProjectLocationRecord | ProjectPropRecord,
): LocationAssetSummary | PropAssetSummary {
  const registration = getAssetKindRegistration(kind)
  const variants = buildLocationVariants('project', asset.id, asset.images)
  const selectedVariant = variants.find((variant) => variant.renders[0]?.isSelected)
  const base = {
    id: asset.id,
    scope: 'project' as const,
    kind,
    family: 'visual' as const,
    name: asset.name,
    folderId: null,
    capabilities: registration.capabilities,
    taskRefs: [
      {
        targetType: 'LocationImage',
        targetId: asset.id,
        types: ['image_location', 'modify_asset_image', 'regenerate_group'],
      },
    ],
    taskState: createIdleTaskState(),
    variants,
    summary: asset.summary,
    selectedVariantId: selectedVariant?.id ?? null,
  }
  return base
}

function mapLocationLikeGlobalAsset(
  kind: 'location' | 'prop',
  asset: GlobalLocationRecord | GlobalPropRecord,
): LocationAssetSummary | PropAssetSummary {
  const registration = getAssetKindRegistration(kind)
  const variants = buildLocationVariants('global', asset.id, asset.images)
  const selectedVariant = variants.find((variant) => variant.renders[0]?.isSelected)
  return {
    id: asset.id,
    scope: 'global',
    kind,
    family: 'visual',
    name: asset.name,
    folderId: asset.folderId,
    capabilities: registration.capabilities,
    taskRefs: [
      {
        targetType: 'GlobalLocation',
        targetId: asset.id,
        types: ['asset_hub_image'],
      },
    ],
    taskState: createIdleTaskState(),
    variants,
    summary: asset.summary,
    selectedVariantId: selectedVariant?.id ?? null,
  }
}

export function mapProjectLocationToAsset(location: ProjectLocationRecord): LocationAssetSummary {
  return mapLocationLikeProjectAsset('location', location) as LocationAssetSummary
}

export function mapGlobalLocationToAsset(location: GlobalLocationRecord): LocationAssetSummary {
  return mapLocationLikeGlobalAsset('location', location) as LocationAssetSummary
}

export function mapProjectPropToAsset(prop: ProjectPropRecord): PropAssetSummary {
  return mapLocationLikeProjectAsset('prop', prop) as PropAssetSummary
}

export function mapGlobalPropToAsset(prop: GlobalPropRecord): PropAssetSummary {
  return mapLocationLikeGlobalAsset('prop', prop) as PropAssetSummary
}

export function mapGlobalVoiceToAsset(voice: GlobalVoiceRecord): VoiceAssetSummary {
  const registration = getAssetKindRegistration('voice')
  return {
    id: voice.id,
    scope: 'global',
    kind: 'voice',
    family: 'audio',
    name: voice.name,
    folderId: voice.folderId,
    capabilities: registration.capabilities,
    taskRefs: [],
    taskState: createIdleTaskState(),
    voiceMeta: {
      description: voice.description,
      voiceId: voice.voiceId,
      voiceType: voice.voiceType,
      customVoiceUrl: voice.customVoiceUrl,
      media: voice.media ?? null,
      voicePrompt: voice.voicePrompt,
      gender: voice.gender,
      language: voice.language,
    },
  }
}

export function filterAssetsByKind(
  assets: AssetSummary[],
  kind: AssetSummary['kind'] | null | undefined,
): AssetSummary[] {
  if (!kind) return assets
  return assets.filter((asset) => asset.kind === kind)
}
