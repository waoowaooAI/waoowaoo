import type { Locale } from '@/i18n/routing'

export const TASK_STATUS = {
  QUEUED: 'queued',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  DISMISSED: 'dismissed',
} as const

export type TaskStatus = (typeof TASK_STATUS)[keyof typeof TASK_STATUS]

export const TASK_EVENT_TYPE = {
  CREATED: 'task.created',
  PROCESSING: 'task.processing',
  PROGRESS: 'task.progress',
  COMPLETED: 'task.completed',
  FAILED: 'task.failed',
} as const

export type TaskEventType = (typeof TASK_EVENT_TYPE)[keyof typeof TASK_EVENT_TYPE]

export const TASK_SSE_EVENT_TYPE = {
  LIFECYCLE: 'task.lifecycle',
  STREAM: 'task.stream',
} as const

export type TaskSSEEventType = (typeof TASK_SSE_EVENT_TYPE)[keyof typeof TASK_SSE_EVENT_TYPE]

export const TASK_LIFECYCLE_EVENT_TYPES = [
  TASK_EVENT_TYPE.CREATED,
  TASK_EVENT_TYPE.PROCESSING,
  TASK_EVENT_TYPE.COMPLETED,
  TASK_EVENT_TYPE.FAILED,
] as const

export type TaskLifecycleEventType = (typeof TASK_LIFECYCLE_EVENT_TYPES)[number]

export const TASK_TYPE = {
  IMAGE_PANEL: 'image_panel',
  IMAGE_CHARACTER: 'image_character',
  IMAGE_LOCATION: 'image_location',
  VIDEO_PANEL: 'video_panel',
  LIP_SYNC: 'lip_sync',
  VOICE_LINE: 'voice_line',
  VOICE_DESIGN: 'voice_design',
  ASSET_HUB_VOICE_DESIGN: 'asset_hub_voice_design',
  REGENERATE_STORYBOARD_TEXT: 'regenerate_storyboard_text',
  INSERT_PANEL: 'insert_panel',
  PANEL_VARIANT: 'panel_variant',
  MODIFY_ASSET_IMAGE: 'modify_asset_image',
  REGENERATE_GROUP: 'regenerate_group',
  ASSET_HUB_IMAGE: 'asset_hub_image',
  ASSET_HUB_MODIFY: 'asset_hub_modify',
  ANALYZE_NOVEL: 'analyze_novel',
  STORY_TO_SCRIPT_RUN: 'story_to_script_run',
  SCRIPT_TO_STORYBOARD_RUN: 'script_to_storyboard_run',
  CLIPS_BUILD: 'clips_build',
  SCREENPLAY_CONVERT: 'screenplay_convert',
  VOICE_ANALYZE: 'voice_analyze',
  ANALYZE_GLOBAL: 'analyze_global',
  AI_MODIFY_APPEARANCE: 'ai_modify_appearance',
  AI_MODIFY_LOCATION: 'ai_modify_location',
  AI_MODIFY_SHOT_PROMPT: 'ai_modify_shot_prompt',
  ANALYZE_SHOT_VARIANTS: 'analyze_shot_variants',
  AI_CREATE_CHARACTER: 'ai_create_character',
  AI_CREATE_LOCATION: 'ai_create_location',
  REFERENCE_TO_CHARACTER: 'reference_to_character',
  CHARACTER_PROFILE_CONFIRM: 'character_profile_confirm',
  CHARACTER_PROFILE_BATCH_CONFIRM: 'character_profile_batch_confirm',
  EPISODE_SPLIT_LLM: 'episode_split_llm',
  ASSET_HUB_AI_DESIGN_CHARACTER: 'asset_hub_ai_design_character',
  ASSET_HUB_AI_DESIGN_LOCATION: 'asset_hub_ai_design_location',
  ASSET_HUB_AI_MODIFY_CHARACTER: 'asset_hub_ai_modify_character',
  ASSET_HUB_AI_MODIFY_LOCATION: 'asset_hub_ai_modify_location',
  ASSET_HUB_REFERENCE_TO_CHARACTER: 'asset_hub_reference_to_character',
} as const

export type TaskType = (typeof TASK_TYPE)[keyof typeof TASK_TYPE]

export type QueueType = 'image' | 'video' | 'voice' | 'text'

export type BillingMode = 'OFF' | 'SHADOW' | 'ENFORCE'

export type TaskBillingInfo =
  | {
    billable: false
    source?: 'task'
    status?: 'skipped'
  }
  | {
    billable: true
    source: 'task'
    taskType: TaskType
    apiType: 'text' | 'image' | 'video' | 'voice' | 'voice-design' | 'lip-sync'
    model: string
    quantity: number
    unit: 'token' | 'image' | 'video' | 'second' | 'call'
    maxFrozenCost: number
    pricingVersion?: string
    action: string
    metadata?: Record<string, unknown>
    billingKey?: string
    freezeId?: string | null
    modeSnapshot?: BillingMode | null
    status?: 'skipped' | 'quoted' | 'frozen' | 'settled' | 'rolled_back' | 'failed'
    chargedCost?: number
  }

export type TaskJobData = {
  taskId: string
  type: TaskType
  locale: Locale
  projectId: string
  episodeId?: string | null
  targetType: string
  targetId: string
  payload?: Record<string, unknown> | null
  billingInfo?: TaskBillingInfo | null
  userId: string
  trace?: {
    requestId?: string | null
  } | null
}

export type SSEEvent = {
  id: string
  type: TaskSSEEventType
  taskId: string
  projectId: string
  userId: string
  ts: string
  taskType?: string | null
  targetType?: string | null
  targetId?: string | null
  episodeId?: string | null
  payload?: (Record<string, unknown> & {
    lifecycleType?: TaskLifecycleEventType
  }) | null
}

export type CreateTaskInput = {
  userId: string
  projectId: string
  episodeId?: string | null
  type: TaskType
  targetType: string
  targetId: string
  payload?: Record<string, unknown> | null
  dedupeKey?: string | null
  priority?: number
  maxAttempts?: number
  billingInfo?: TaskBillingInfo | null
}
