import { TASK_TYPE, type TaskType } from '@/lib/task/types'

export type TaskTestLayer = 'unit-helper' | 'worker-unit' | 'api-contract' | 'chain'

export type TaskTypeCoverageEntry = {
  taskType: TaskType
  owner: string
  layers: ReadonlyArray<TaskTestLayer>
}

const TASK_TYPE_OWNER_MAP = {
  [TASK_TYPE.IMAGE_PANEL]: 'tests/unit/worker/panel-image-task-handler.test.ts',
  [TASK_TYPE.IMAGE_CHARACTER]: 'tests/unit/worker/character-image-task-handler.test.ts',
  [TASK_TYPE.IMAGE_LOCATION]: 'tests/unit/worker/location-image-task-handler.test.ts',
  [TASK_TYPE.VIDEO_PANEL]: 'tests/unit/worker/video-worker.test.ts',
  [TASK_TYPE.LIP_SYNC]: 'tests/unit/worker/video-worker.test.ts',
  [TASK_TYPE.VOICE_LINE]: 'tests/unit/worker/voice-worker.test.ts',
  [TASK_TYPE.VOICE_DESIGN]: 'tests/unit/worker/voice-worker.test.ts',
  [TASK_TYPE.ASSET_HUB_VOICE_DESIGN]: 'tests/unit/worker/voice-worker.test.ts',
  [TASK_TYPE.REGENERATE_STORYBOARD_TEXT]: 'tests/unit/worker/script-to-storyboard.test.ts',
  [TASK_TYPE.INSERT_PANEL]: 'tests/unit/worker/script-to-storyboard.test.ts',
  [TASK_TYPE.PANEL_VARIANT]: 'tests/unit/worker/panel-variant-task-handler.test.ts',
  [TASK_TYPE.MODIFY_ASSET_IMAGE]: 'tests/unit/worker/image-task-handlers-core.test.ts',
  [TASK_TYPE.REGENERATE_GROUP]: 'tests/unit/worker/image-task-handlers-core.test.ts',
  [TASK_TYPE.ASSET_HUB_IMAGE]: 'tests/unit/worker/asset-hub-image-suffix.test.ts',
  [TASK_TYPE.ASSET_HUB_MODIFY]: 'tests/unit/worker/modify-image-reference-description.test.ts',
  [TASK_TYPE.ANALYZE_NOVEL]: 'tests/unit/worker/analyze-novel.test.ts',
  [TASK_TYPE.STORY_TO_SCRIPT_RUN]: 'tests/unit/worker/story-to-script.test.ts',
  [TASK_TYPE.SCRIPT_TO_STORYBOARD_RUN]: 'tests/unit/worker/script-to-storyboard.test.ts',
  [TASK_TYPE.CLIPS_BUILD]: 'tests/unit/worker/clips-build.test.ts',
  [TASK_TYPE.SCREENPLAY_CONVERT]: 'tests/unit/worker/screenplay-convert.test.ts',
  [TASK_TYPE.VOICE_ANALYZE]: 'tests/unit/worker/voice-analyze.test.ts',
  [TASK_TYPE.ANALYZE_GLOBAL]: 'tests/unit/worker/analyze-global.test.ts',
  [TASK_TYPE.AI_MODIFY_APPEARANCE]: 'tests/unit/worker/shot-ai-prompt-appearance.test.ts',
  [TASK_TYPE.AI_MODIFY_LOCATION]: 'tests/unit/worker/shot-ai-prompt-location.test.ts',
  [TASK_TYPE.AI_MODIFY_SHOT_PROMPT]: 'tests/unit/worker/shot-ai-prompt-shot.test.ts',
  [TASK_TYPE.ANALYZE_SHOT_VARIANTS]: 'tests/unit/worker/shot-ai-variants.test.ts',
  [TASK_TYPE.AI_CREATE_CHARACTER]: 'tests/unit/worker/shot-ai-tasks.test.ts',
  [TASK_TYPE.AI_CREATE_LOCATION]: 'tests/unit/worker/shot-ai-tasks.test.ts',
  [TASK_TYPE.REFERENCE_TO_CHARACTER]: 'tests/unit/worker/reference-to-character.test.ts',
  [TASK_TYPE.CHARACTER_PROFILE_CONFIRM]: 'tests/unit/worker/character-profile.test.ts',
  [TASK_TYPE.CHARACTER_PROFILE_BATCH_CONFIRM]: 'tests/unit/worker/character-profile.test.ts',
  [TASK_TYPE.EPISODE_SPLIT_LLM]: 'tests/unit/worker/episode-split.test.ts',
  [TASK_TYPE.ASSET_HUB_AI_DESIGN_CHARACTER]: 'tests/unit/worker/asset-hub-ai-design.test.ts',
  [TASK_TYPE.ASSET_HUB_AI_DESIGN_LOCATION]: 'tests/unit/worker/asset-hub-ai-design.test.ts',
  [TASK_TYPE.ASSET_HUB_AI_MODIFY_CHARACTER]: 'tests/unit/worker/asset-hub-ai-modify.test.ts',
  [TASK_TYPE.ASSET_HUB_AI_MODIFY_LOCATION]: 'tests/unit/worker/asset-hub-ai-modify.test.ts',
  [TASK_TYPE.ASSET_HUB_REFERENCE_TO_CHARACTER]: 'tests/unit/worker/reference-to-character.test.ts',
} as const satisfies Record<TaskType, string>

export const TASK_TYPE_CATALOG: ReadonlyArray<TaskTypeCoverageEntry> = (Object.values(TASK_TYPE) as TaskType[])
  .map((taskType) => ({
    taskType,
    owner: TASK_TYPE_OWNER_MAP[taskType],
    layers: ['worker-unit', 'api-contract', 'chain'],
  }))

export const TASK_TYPE_COUNT = TASK_TYPE_CATALOG.length
