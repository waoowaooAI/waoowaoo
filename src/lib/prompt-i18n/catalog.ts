import { PROMPT_IDS, type PromptId } from './prompt-ids'
import type { PromptCatalogEntry } from './types'

export const PROMPT_CATALOG: Record<PromptId, PromptCatalogEntry> = {
  [PROMPT_IDS.CHARACTER_IMAGE_TO_DESCRIPTION]: {
    pathStem: 'character-reference/character_image_to_description',
    variableKeys: [],
  },
  [PROMPT_IDS.CHARACTER_REFERENCE_TO_SHEET]: {
    pathStem: 'character-reference/character_reference_to_sheet',
    variableKeys: [],
  },
  [PROMPT_IDS.NP_AGENT_ACTING_DIRECTION]: {
    pathStem: 'novel-promotion/agent_acting_direction',
    variableKeys: ['panels_json', 'panel_count', 'characters_info'],
  },
  [PROMPT_IDS.NP_AGENT_CHARACTER_PROFILE]: {
    pathStem: 'novel-promotion/agent_character_profile',
    variableKeys: ['input', 'characters_lib_info'],
  },
  [PROMPT_IDS.NP_AGENT_CHARACTER_VISUAL]: {
    pathStem: 'novel-promotion/agent_character_visual',
    variableKeys: ['character_profiles'],
  },
  [PROMPT_IDS.NP_AGENT_CINEMATOGRAPHER]: {
    pathStem: 'novel-promotion/agent_cinematographer',
    variableKeys: ['panels_json', 'panel_count', 'locations_description', 'characters_info'],
  },
  [PROMPT_IDS.NP_AGENT_CLIP]: {
    pathStem: 'novel-promotion/agent_clip',
    variableKeys: ['input', 'locations_lib_name', 'characters_lib_name', 'characters_introduction'],
  },
  [PROMPT_IDS.NP_AGENT_SHOT_VARIANT_ANALYSIS]: {
    pathStem: 'novel-promotion/agent_shot_variant_analysis',
    variableKeys: ['panel_description', 'shot_type', 'camera_move', 'location', 'characters_info'],
  },
  [PROMPT_IDS.NP_AGENT_SHOT_VARIANT_GENERATE]: {
    pathStem: 'novel-promotion/agent_shot_variant_generate',
    variableKeys: [
      'original_description',
      'original_shot_type',
      'original_camera_move',
      'location',
      'characters_info',
      'variant_title',
      'variant_description',
      'target_shot_type',
      'target_camera_move',
      'video_prompt',
      'character_assets',
      'location_asset',
      'aspect_ratio',
      'style',
    ],
  },
  [PROMPT_IDS.NP_AGENT_STORYBOARD_DETAIL]: {
    pathStem: 'novel-promotion/agent_storyboard_detail',
    variableKeys: ['panels_json', 'characters_age_gender', 'locations_description'],
  },
  [PROMPT_IDS.NP_AGENT_STORYBOARD_INSERT]: {
    pathStem: 'novel-promotion/agent_storyboard_insert',
    variableKeys: [
      'prev_panel_json',
      'next_panel_json',
      'characters_full_description',
      'locations_description',
      'user_input',
    ],
  },
  [PROMPT_IDS.NP_AGENT_STORYBOARD_PLAN]: {
    pathStem: 'novel-promotion/agent_storyboard_plan',
    variableKeys: [
      'characters_lib_name',
      'locations_lib_name',
      'characters_introduction',
      'characters_appearance_list',
      'characters_full_description',
      'clip_json',
      'clip_content',
    ],
  },
  [PROMPT_IDS.NP_CHARACTER_CREATE]: {
    pathStem: 'novel-promotion/character_create',
    variableKeys: ['user_input'],
  },
  [PROMPT_IDS.NP_CHARACTER_DESCRIPTION_UPDATE]: {
    pathStem: 'novel-promotion/character_description_update',
    variableKeys: ['original_description', 'modify_instruction', 'image_context'],
  },
  [PROMPT_IDS.NP_CHARACTER_MODIFY]: {
    pathStem: 'novel-promotion/character_modify',
    variableKeys: ['character_input', 'user_input'],
  },
  [PROMPT_IDS.NP_CHARACTER_REGENERATE]: {
    pathStem: 'novel-promotion/character_regenerate',
    variableKeys: ['character_name', 'current_descriptions', 'change_reason', 'novel_text'],
  },
  [PROMPT_IDS.NP_EPISODE_SPLIT]: {
    pathStem: 'novel-promotion/episode_split',
    variableKeys: ['CONTENT'],
  },
  [PROMPT_IDS.NP_IMAGE_PROMPT_MODIFY]: {
    pathStem: 'novel-promotion/image_prompt_modify',
    variableKeys: ['prompt_input', 'user_input', 'video_prompt_input'],
  },
  [PROMPT_IDS.NP_LOCATION_CREATE]: {
    pathStem: 'novel-promotion/location_create',
    variableKeys: ['user_input'],
  },
  [PROMPT_IDS.NP_LOCATION_DESCRIPTION_UPDATE]: {
    pathStem: 'novel-promotion/location_description_update',
    variableKeys: ['location_name', 'original_description', 'modify_instruction', 'image_context'],
  },
  [PROMPT_IDS.NP_LOCATION_MODIFY]: {
    pathStem: 'novel-promotion/location_modify',
    variableKeys: ['location_name', 'location_input', 'user_input'],
  },
  [PROMPT_IDS.NP_LOCATION_REGENERATE]: {
    pathStem: 'novel-promotion/location_regenerate',
    variableKeys: ['location_name', 'current_descriptions'],
  },
  [PROMPT_IDS.NP_SCREENPLAY_CONVERSION]: {
    pathStem: 'novel-promotion/screenplay_conversion',
    variableKeys: ['clip_content', 'locations_lib_name', 'characters_lib_name', 'characters_introduction', 'clip_id'],
  },
  [PROMPT_IDS.NP_SELECT_LOCATION]: {
    pathStem: 'novel-promotion/select_location',
    variableKeys: ['input', 'locations_lib_name'],
  },
  [PROMPT_IDS.NP_SINGLE_PANEL_IMAGE]: {
    pathStem: 'novel-promotion/single_panel_image',
    variableKeys: ['storyboard_text_json_input', 'source_text', 'aspect_ratio', 'style'],
  },
  [PROMPT_IDS.NP_STORYBOARD_EDIT]: {
    pathStem: 'novel-promotion/storyboard_edit',
    variableKeys: ['user_input'],
  },
  [PROMPT_IDS.NP_VOICE_ANALYSIS]: {
    pathStem: 'novel-promotion/voice_analysis',
    variableKeys: ['input', 'characters_lib_name', 'characters_introduction', 'storyboard_json'],
  },
}
