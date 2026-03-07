'use client'

import type { AssetLibraryCharacter, AssetLibraryLocation, NovelPromotionShot } from '@/types/project'

export interface PromptsStageShellProps {
  projectId: string
  shots: NovelPromotionShot[]
  viewMode: 'card' | 'table'
  onViewModeChange: (mode: 'card' | 'table') => void
  onGenerateImage: (shotId: string, extraReferenceAssetIds?: string[]) => void
  onGenerateAllImages: () => void
  isBatchSubmitting?: boolean
  onBack?: () => void
  onNext: () => void
  onUpdatePrompt: (shotId: string, field: 'imagePrompt', value: string) => Promise<void>
  artStyle: string
  assetLibraryCharacters: AssetLibraryCharacter[]
  assetLibraryLocations: AssetLibraryLocation[]
  onAppendContent?: (content: string) => Promise<void>
}

export type LocationAssetWithImages = AssetLibraryLocation & {
  selectedImageId?: string | null
  images?: Array<{
    id: string
    isSelected?: boolean
    imageUrl?: string | null
    description?: string | null
  }>
}

export interface PromptAssetReference {
  id: string
  name: string
  description: string
  type: 'character' | 'location'
}

export interface PromptShotEditState {
  editValue: string
  aiModifyInstruction: string
  selectedAssets: PromptAssetReference[]
  showAssetPicker: boolean
}

export interface PromptEditingTarget {
  shotId: string
  field: 'imagePrompt'
}
