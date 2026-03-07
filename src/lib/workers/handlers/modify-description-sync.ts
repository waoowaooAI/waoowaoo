import { executeAiTextStep, executeAiVisionStep } from '@/lib/ai-runtime'
import { removeCharacterPromptSuffix, removeLocationPromptSuffix } from '@/lib/constants'
import { safeParseJsonObject } from '@/lib/json-repair'
import { buildPrompt, PROMPT_IDS } from '@/lib/prompt-i18n'
import type { PromptLocale } from '@/lib/prompt-i18n/types'
import {
  buildCharacterDescriptionFields,
  readIndexedDescription,
} from '@/lib/assets/description-fields'

export type SyncedAssetType = 'character' | 'location'

function trimText(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

function buildImageContext(type: SyncedAssetType, hasReferenceImages: boolean): string {
  if (!hasReferenceImages) return ''
  if (type === 'character') {
    return '【参考图片】\n请仔细分析参考图片中的服装款式、颜色、材质、配饰等关键视觉特征，并将这些特征融入更新后的描述中。'
  }
  return '【参考图片】\n请仔细分析参考图片中的建筑风格、装饰元素、光线氛围、色调等关键视觉特征，并将这些特征融入更新后的描述中。'
}

function parseModifiedDescription(responseText: string): string {
  const parsed = safeParseJsonObject(responseText)
  const prompt = trimText(typeof parsed.prompt === 'string' ? parsed.prompt : '')
  if (!prompt) {
    throw new Error('No prompt field in response')
  }
  return prompt
}

export { buildCharacterDescriptionFields, readIndexedDescription }

export async function generateModifiedAssetDescription(params: {
  userId: string
  model: string
  locale: PromptLocale
  type: SyncedAssetType
  currentDescription: string
  modifyInstruction: string
  referenceImages?: string[]
  locationName?: string
  projectId?: string
}): Promise<string> {
  const hasReferenceImages = Array.isArray(params.referenceImages) && params.referenceImages.length > 0
  const finalPrompt = params.type === 'character'
    ? buildPrompt({
      promptId: PROMPT_IDS.NP_CHARACTER_DESCRIPTION_UPDATE,
      locale: params.locale,
      variables: {
        original_description: removeCharacterPromptSuffix(params.currentDescription),
        modify_instruction: params.modifyInstruction,
        image_context: buildImageContext('character', hasReferenceImages),
      },
    })
    : buildPrompt({
      promptId: PROMPT_IDS.NP_LOCATION_DESCRIPTION_UPDATE,
      locale: params.locale,
      variables: {
        location_name: trimText(params.locationName) || '场景',
        original_description: removeLocationPromptSuffix(params.currentDescription),
        modify_instruction: params.modifyInstruction,
        image_context: buildImageContext('location', hasReferenceImages),
      },
    })

  if (hasReferenceImages) {
    const completion = await executeAiVisionStep({
      userId: params.userId,
      model: params.model,
      prompt: finalPrompt,
      imageUrls: params.referenceImages ?? [],
      temperature: 0.7,
      ...(params.projectId ? { projectId: params.projectId } : {}),
    })
    return parseModifiedDescription(completion.text)
  }

  const completion = await executeAiTextStep({
    userId: params.userId,
    model: params.model,
    messages: [{ role: 'user', content: finalPrompt }],
    temperature: 0.7,
    ...(params.projectId ? { projectId: params.projectId } : {}),
    action: params.type === 'character'
      ? 'sync_character_description_after_image_modify'
      : 'sync_location_description_after_image_modify',
    meta: {
      stepId: params.type === 'character'
        ? 'sync_character_description_after_image_modify'
        : 'sync_location_description_after_image_modify',
      stepTitle: params.type === 'character' ? '同步角色描述' : '同步场景描述',
      stepIndex: 1,
      stepTotal: 1,
    },
  })
  return parseModifiedDescription(completion.text)
}
