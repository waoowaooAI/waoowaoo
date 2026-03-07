import { TASK_TYPE_CATALOG } from './task-type-catalog'
import type { TaskType } from '@/lib/task/types'

export type TaskTypeBehaviorMatrixEntry = {
  taskType: TaskType
  caseId: string
  workerTest: string
  chainTest: string
  apiContractTest: string
}

function resolveChainTestByTaskType(taskType: TaskType): string {
  if (taskType === 'video_panel' || taskType === 'lip_sync') {
    return 'tests/integration/chain/video.chain.test.ts'
  }
  if (taskType === 'voice_line' || taskType === 'voice_design' || taskType === 'asset_hub_voice_design') {
    return 'tests/integration/chain/voice.chain.test.ts'
  }
  if (
    taskType === 'analyze_novel'
    || taskType === 'story_to_script_run'
    || taskType === 'script_to_storyboard_run'
    || taskType === 'clips_build'
    || taskType === 'screenplay_convert'
    || taskType === 'voice_analyze'
    || taskType === 'analyze_global'
    || taskType === 'ai_modify_appearance'
    || taskType === 'ai_modify_location'
    || taskType === 'ai_modify_shot_prompt'
    || taskType === 'analyze_shot_variants'
    || taskType === 'ai_create_character'
    || taskType === 'ai_create_location'
    || taskType === 'reference_to_character'
    || taskType === 'character_profile_confirm'
    || taskType === 'character_profile_batch_confirm'
    || taskType === 'episode_split_llm'
    || taskType === 'asset_hub_ai_design_character'
    || taskType === 'asset_hub_ai_design_location'
    || taskType === 'asset_hub_ai_modify_character'
    || taskType === 'asset_hub_ai_modify_location'
    || taskType === 'asset_hub_reference_to_character'
  ) {
    return 'tests/integration/chain/text.chain.test.ts'
  }
  return 'tests/integration/chain/image.chain.test.ts'
}

function resolveApiContractByTaskType(taskType: TaskType): string {
  if (
    taskType === 'analyze_novel'
    || taskType === 'story_to_script_run'
    || taskType === 'script_to_storyboard_run'
    || taskType === 'clips_build'
    || taskType === 'screenplay_convert'
    || taskType === 'voice_analyze'
    || taskType === 'analyze_global'
    || taskType === 'ai_modify_appearance'
    || taskType === 'ai_modify_location'
    || taskType === 'ai_modify_shot_prompt'
    || taskType === 'analyze_shot_variants'
    || taskType === 'ai_create_character'
    || taskType === 'ai_create_location'
    || taskType === 'reference_to_character'
    || taskType === 'character_profile_confirm'
    || taskType === 'character_profile_batch_confirm'
    || taskType === 'episode_split_llm'
    || taskType === 'asset_hub_ai_design_character'
    || taskType === 'asset_hub_ai_design_location'
    || taskType === 'asset_hub_ai_modify_character'
    || taskType === 'asset_hub_ai_modify_location'
    || taskType === 'asset_hub_reference_to_character'
  ) {
    return 'tests/integration/api/contract/llm-observe-routes.test.ts'
  }
  if (
    taskType === 'image_panel'
    || taskType === 'image_character'
    || taskType === 'image_location'
    || taskType === 'video_panel'
    || taskType === 'lip_sync'
    || taskType === 'voice_line'
    || taskType === 'voice_design'
    || taskType === 'asset_hub_voice_design'
    || taskType === 'insert_panel'
    || taskType === 'panel_variant'
    || taskType === 'modify_asset_image'
    || taskType === 'regenerate_group'
    || taskType === 'asset_hub_image'
    || taskType === 'asset_hub_modify'
    || taskType === 'regenerate_storyboard_text'
  ) {
    return 'tests/integration/api/contract/direct-submit-routes.test.ts'
  }
  return 'tests/integration/api/contract/task-infra-routes.test.ts'
}

export const TASKTYPE_BEHAVIOR_MATRIX: ReadonlyArray<TaskTypeBehaviorMatrixEntry> = TASK_TYPE_CATALOG.map((entry) => ({
  taskType: entry.taskType,
  caseId: `TASKTYPE:${entry.taskType}`,
  workerTest: entry.owner,
  chainTest: resolveChainTestByTaskType(entry.taskType),
  apiContractTest: resolveApiContractByTaskType(entry.taskType),
}))

export const TASKTYPE_BEHAVIOR_COUNT = TASKTYPE_BEHAVIOR_MATRIX.length
