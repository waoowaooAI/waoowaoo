import type { CapabilitySelections } from '@/lib/model-config-contract'

// ============================================
// Project mode types
// ============================================
export type ProjectMode = 'novel-promotion'

// ============================================
// Base project types
// ============================================
export interface BaseProject {
  id: string
  name: string
  description: string | null
  mode: ProjectMode
  userId: string
  createdAt: Date
  updatedAt: Date
}

// ============================================
// Common asset types
// ============================================

export interface MediaRef {
  id: string
  publicId: string
  url: string
  mimeType: string | null
  sizeBytes: number | null
  width: number | null
  height: number | null
  durationMs: number | null
}

// Character appearance (standalone table)
// 🔥 V6.5: characterId is now optional to support useProjectAssets return data
export interface CharacterAppearance {
  id: string
  characterId?: string            // Optional, API response may not include
  appearanceIndex: number           // Appearance index: 0, 1, 2... (0 = primary)
  changeReason: string              // "initial appearance", "wet after falling into water"
  description: string | null
  descriptions: string[] | null     // 3 description variants
  imageUrl: string | null           // Selected image
  media?: MediaRef | null
  imageUrls: string[]               // Candidate image array
  imageMedias?: MediaRef[]
  previousImageUrl: string | null   // Previous image URL (for undo)
  previousMedia?: MediaRef | null
  previousImageUrls: string[]         // Previous image array (for undo)
  previousImageMedias?: MediaRef[]
  previousDescription: string | null  // Previous description (for undo)
  previousDescriptions: string[] | null  // Previous descriptions (for undo)
  selectedIndex: number | null      // User selected image index
  // Task state fields (derived from tasks + hook, no longer persisted)
  imageTaskRunning?: boolean
  imageErrorMessage?: string | null  // Image generation error message
  lastError?: { code: string; message: string } | null  // Structured error (from task target state)
}

// Character
// 🔥 V6.5: aliases is now optional array for useProjectAssets compatibility
export interface Character {
  id: string
  name: string
  aliases?: string[] | null         // Optional, aliases array
  introduction?: string | null      // Character intro (narrative perspective, name mapping, etc.)
  appearances: CharacterAppearance[]  // Standalone table relation
  // Voice type settings
  voiceType?: 'custom' | 'qwen-designed' | 'uploaded' | null  // Voice type
  voiceId?: string | null                 // Voice ID or business identifier
  customVoiceUrl?: string | null          // Custom uploaded reference audio URL
  media?: MediaRef | null
  // Character profile (two-phase generation)
  profileData?: string | null             // JSON format character profile
  profileConfirmed?: boolean             // Profile confirmed status
}

// Location images (standalone table)
// 🔥 V6.5: locationId is now optional for useProjectAssets compatibility
export interface LocationImage {
  id: string
  locationId?: string               // Optional, API response may not include
  imageIndex: number              // Image index: 0, 1, 2
  description: string | null
  imageUrl: string | null
  media?: MediaRef | null
  previousImageUrl: string | null // Previous image URL (for undo)
  previousMedia?: MediaRef | null
  previousDescription: string | null  // Previous description (for undo)
  isSelected: boolean
  // Task state fields (derived from tasks + hook, no longer persisted)
  imageTaskRunning?: boolean
  imageErrorMessage?: string | null  // Image generation error message
  lastError?: { code: string; message: string } | null  // Structured error (from task target state)
}

// Location
export interface Location {
  id: string
  name: string
  summary: string | null            // Location brief description(usage/character relation)
  selectedImageId?: string | null   // Selected image ID (single source of truth)
  images: LocationImage[]           // Standalone table relation
}

export interface AssetLibraryCharacter {
  id: string
  name: string
  description: string
  imageUrl: string | null
  media?: MediaRef | null
}

export interface AssetLibraryLocation {
  id: string
  name: string
  description: string
  imageUrl: string | null
  media?: MediaRef | null
}

// ============================================
// Novel promotion mode types
// ============================================

// Workflow mode
export type WorkflowMode = 'srt' | 'agent'

// Clip type (compatible with SRT and Agent modes)
export interface NovelPromotionClip {
  id: string

  // SRT mode fields
  start?: number
  end?: number
  duration?: number

  // Agent mode fields
  startText?: string
  endText?: string
  shotCount?: number

  // Common fields
  summary: string
  location: string | null
  characters: string | null
  content: string
  screenplay?: string | null  // Screenplay JSON (Phase 0 output)
}

export interface NovelPromotionPanel {
  id: string
  storyboardId: string
  panelIndex: number
  panelNumber: number | null
  shotType: string | null
  cameraMove: string | null
  description: string | null
  location: string | null
  characters: string | null
  srtSegment: string | null
  srtStart: number | null
  srtEnd: number | null
  duration: number | null
  imagePrompt: string | null
  imageUrl: string | null
  candidateImages?: string | null
  media?: MediaRef | null
  imageHistory: string | null
  videoPrompt: string | null
  firstLastFramePrompt?: string | null
  videoUrl: string | null
  videoGenerationMode?: 'normal' | 'firstlastframe' | null
  videoMedia?: MediaRef | null
  lipSyncVideoUrl?: string | null
  lipSyncVideoMedia?: MediaRef | null
  sketchImageUrl?: string | null
  sketchImageMedia?: MediaRef | null
  previousImageUrl?: string | null
  previousImageMedia?: MediaRef | null
  photographyRules: string | null  // Single shot photography rules JSON
  actingNotes: string | null        // Acting notes data JSON
  // Task state fields (derived from tasks + hook, no longer persisted)
  imageTaskRunning?: boolean
  videoTaskRunning?: boolean
  imageErrorMessage?: string | null  // Image generation error message
}

export interface NovelPromotionStoryboard {
  id: string
  episodeId: string
  clipId: string
  storyboardTextJson: string | null
  panelCount: number
  storyboardImageUrl: string | null
  media?: MediaRef | null
  storyboardTaskRunning?: boolean
  candidateImages?: string | null
  lastError?: string | null  // Last generation error message
  photographyPlan?: string | null  // Photography plan JSON
  panels?: NovelPromotionPanel[]
}

export interface NovelPromotionShot {
  id: string
  shotId: string
  srtStart: number
  srtEnd: number
  srtDuration: number
  sequence: string | null
  locations: string | null
  characters: string | null
  plot: string | null
  pov: string | null
  imagePrompt: string | null
  scale: string | null
  module: string | null
  focus: string | null
  zhSummarize: string | null
  imageUrl: string | null
  media?: MediaRef | null
  videoUrl?: string | null
  videoMedia?: MediaRef | null
  // Task state fields (derived from tasks + hook, no longer persisted)
  imageTaskRunning?: boolean
}

export interface NovelPromotionProject {
  id: string
  projectId: string
  stage: string
  globalAssetText: string | null
  novelText: string | null
  analysisModel: string
  imageModel: string
  characterModel: string
  locationModel: string
  storyboardModel: string
  editModel: string
  videoModel: string
  videoRatio: string
  capabilityOverrides?: CapabilitySelections | string | null
  ttsRate: string
  workflowMode: WorkflowMode  // New: workflow mode
  artStyle: string
  artStylePrompt: string | null
  audioUrl: string | null
  media?: MediaRef | null
  srtContent: string | null
  characters?: Character[]
  locations?: Location[]
  episodes?: Array<{
    id: string
    episodeNumber: number
    name: string
    description: string | null
    novelText: string | null
    audioUrl: string | null
    srtContent: string | null
    createdAt: Date
    updatedAt: Date
  }>
  clips?: NovelPromotionClip[]
  storyboards?: NovelPromotionStoryboard[]
  shots?: NovelPromotionShot[]
}

// ============================================
// Full project type (includes base info and mode data)
// ============================================
export interface Project extends BaseProject {
  novelPromotionData?: NovelPromotionProject
}
