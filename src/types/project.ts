import type { CapabilitySelections } from '@/lib/model-config-contract'

// ============================================
// 项目模式类型
// ============================================
export type ProjectMode = 'novel-promotion'

// ============================================
// 基础项目类型
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
// 通用资产类型
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

// 角色形象（独立表）
// 🔥 V6.5: characterId 改为可选以兼容 useProjectAssets 返回的数据
export interface CharacterAppearance {
  id: string
  characterId?: string            // 可选，API 响应可能不包含
  appearanceIndex: number           // 形象序号：0, 1, 2...（0 = 主形象）
  changeReason: string              // "初始形象"、"落水湿身"
  description: string | null
  descriptions: string[] | null     // 3个描述变体
  imageUrl: string | null           // 选中的图片
  media?: MediaRef | null
  imageUrls: string[]               // 候选图片数组
  imageMedias?: MediaRef[]
  previousImageUrl: string | null   // 上一次的图片URL（用于撤回）
  previousMedia?: MediaRef | null
  previousImageUrls: string[]         // 上一次的图片数组（用于撤回）
  previousImageMedias?: MediaRef[]
  previousDescription: string | null  // 上一次的描述（用于撤回）
  previousDescriptions: string[] | null  // 上一次的描述数组（用于撤回）
  selectedIndex: number | null      // 用户选中的图片索引
  // 任务态字段（由 tasks + hook 派生，不再依赖数据库持久化）
  imageTaskRunning?: boolean
  imageErrorMessage?: string | null  // 图片生成错误消息
  lastError?: { code: string; message: string } | null  // 结构化错误（来自 task target state）
}

// 角色
// 🔥 V6.5: aliases 改为可选数组以兼容 useProjectAssets
export interface Character {
  id: string
  name: string
  aliases?: string[] | null         // 可选，别名数组
  introduction?: string | null      // 角色介绍（叙述视角、称呼映射等）
  appearances: CharacterAppearance[]  // 独立表关联
  // 配音音色设置
  voiceType?: 'custom' | 'qwen-designed' | 'uploaded' | null  // 音色类型
  voiceId?: string | null                 // 音色 ID 或业务标识
  customVoiceUrl?: string | null          // 自定义上传的参考音频URL
  media?: MediaRef | null
  // 角色档案（两阶段生成）
  profileData?: string | null             // JSON格式的角色档案
  profileConfirmed?: boolean             // 档案是否已确认
}

// 场景图片（独立表）
// 🔥 V6.5: locationId 改为可选以兼容 useProjectAssets
export interface LocationImage {
  id: string
  locationId?: string               // 可选，API 响应可能不包含
  imageIndex: number              // 图片索引：0, 1, 2
  description: string | null
  imageUrl: string | null
  media?: MediaRef | null
  previousImageUrl: string | null // 上一次的图片URL（用于撤回）
  previousMedia?: MediaRef | null
  previousDescription: string | null  // 上一次的描述（用于撤回）
  isSelected: boolean
  // 任务态字段（由 tasks + hook 派生，不再依赖数据库持久化）
  imageTaskRunning?: boolean
  imageErrorMessage?: string | null  // 图片生成错误消息
  lastError?: { code: string; message: string } | null  // 结构化错误（来自 task target state）
}

// 场景
export interface Location {
  id: string
  name: string
  summary: string | null            // 场景简要描述（用途/人物关联）
  selectedImageId?: string | null   // 选中的图片ID（单一真源）
  images: LocationImage[]           // 独立表关联
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
// 小说推文模式类型
// ============================================

// 工作流模式
export type WorkflowMode = 'srt' | 'agent'

// Clip类型（兼容SRT和Agent两种模式）
export interface NovelPromotionClip {
  id: string

  // SRT模式字段
  start?: number
  end?: number
  duration?: number

  // Agent模式字段
  startText?: string
  endText?: string
  shotCount?: number

  // 共用字段
  summary: string
  location: string | null
  characters: string | null
  content: string
  screenplay?: string | null  // 剧本JSON（Phase 0输出）
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
  photographyRules: string | null  // 单镜头摄影规则JSON
  actingNotes: string | null        // 演技指导数据JSON
  // 任务态字段（由 tasks + hook 派生，不再依赖数据库持久化）
  imageTaskRunning?: boolean
  videoTaskRunning?: boolean
  imageErrorMessage?: string | null  // 图片生成错误消息
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
  lastError?: string | null  // 最后一次生成失败的错误信息
  photographyPlan?: string | null  // 摄影方案JSON
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
  // 任务态字段（由 tasks + hook 派生，不再依赖数据库持久化）
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
  workflowMode: WorkflowMode  // 新增：工作流模式
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
// 完整项目类型 (包含基础信息和模式数据)
// ============================================
export interface Project extends BaseProject {
  novelPromotionData?: NovelPromotionProject
}
