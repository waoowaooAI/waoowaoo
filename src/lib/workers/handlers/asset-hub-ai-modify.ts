import type { Job } from 'bullmq'
import { executeAiTextStep } from '@/lib/ai-exec/engine'
import { getUserModelConfig } from '@/lib/config-service'
import { removeCharacterPromptSuffix, removeLocationPromptSuffix, removePropPromptSuffix } from '@/lib/constants'
import { withInternalLLMStreamCallbacks } from '@/lib/llm-observe/internal-stream-context'
import { reportTaskProgress } from '@/lib/workers/shared'
import { assertTaskActive } from '@/lib/workers/utils'
import type { TaskJobData } from '@/lib/task/types'
import { TASK_TYPE } from '@/lib/task/types'
import { createWorkerLLMStreamCallbacks, createWorkerLLMStreamContext } from './llm-stream'
import { buildAiPrompt as buildPrompt, AI_PROMPT_IDS as PROMPT_IDS } from '@/lib/ai-prompts'
import { normalizeLocationAvailableSlots } from '@/lib/location-available-slots'

function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${field} is required`)
  }
  return value.trim()
}

import { safeParseJsonObject } from '@/lib/json-repair'

function parseJsonPrompt(responseText: string): {
  prompt: string
  availableSlots: ReturnType<typeof normalizeLocationAvailableSlots>
} {
  const parsed = safeParseJsonObject(responseText)
  const prompt = typeof parsed.prompt === 'string' ? parsed.prompt.trim() : ''
  if (!prompt) {
    throw new Error('No prompt field in response')
  }
  return {
    prompt,
    availableSlots: normalizeLocationAvailableSlots(parsed.available_slots),
  }
}

export async function handleAssetHubAIModifyTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as Record<string, unknown>
  const userConfig = await getUserModelConfig(job.data.userId)
  if (!userConfig.analysisModel) {
    throw new Error('请先在用户配置中设置分析模型')
  }

  const isCharacter = job.data.type === TASK_TYPE.ASSET_HUB_AI_MODIFY_CHARACTER
  const isLocation = job.data.type === TASK_TYPE.ASSET_HUB_AI_MODIFY_LOCATION
  const isProp = job.data.type === TASK_TYPE.ASSET_HUB_AI_MODIFY_PROP
  if (!isCharacter && !isLocation && !isProp) {
    throw new Error(`Unsupported task type: ${job.data.type}`)
  }

  const targetIdField = isCharacter ? 'characterId' : isProp ? 'propId' : 'locationId'
  const targetId = readRequiredString(payload[targetIdField], targetIdField)
  const modifyInstruction = readRequiredString(payload.modifyInstruction, 'modifyInstruction')
  const currentDescriptionRaw = readRequiredString(payload.currentDescription, 'currentDescription')

  const finalPrompt = isCharacter
    ? buildPrompt({
      promptId: PROMPT_IDS.CHARACTER_MODIFY,
      locale: job.data.locale,
      variables: {
        character_input: removeCharacterPromptSuffix(currentDescriptionRaw),
        user_input: modifyInstruction,
      },
    })
    : isProp
      ? buildPrompt({
        promptId: PROMPT_IDS.PROP_UPDATE_DESCRIPTION,
        locale: job.data.locale,
        variables: {
          prop_name: readRequiredString(payload.propName || '道具', 'propName'),
          original_description: removePropPromptSuffix(currentDescriptionRaw),
          modify_instruction: modifyInstruction,
          image_context: '',
        },
      })
    : buildPrompt({
      promptId: PROMPT_IDS.LOCATION_MODIFY,
      locale: job.data.locale,
      variables: {
        location_name: readRequiredString(payload.locationName || '场景', 'locationName'),
        location_input: removeLocationPromptSuffix(currentDescriptionRaw),
        user_input: modifyInstruction,
      },
    })

  await reportTaskProgress(job, 25, {
    stage: 'asset_hub_ai_modify_prepare',
    stageLabel: '准备资产修改参数',
    displayMode: 'detail',
  })
  await assertTaskActive(job, 'asset_hub_ai_modify_prepare')

  const streamContextKey = isCharacter
    ? 'asset_hub_ai_modify_character'
    : isProp
      ? 'asset_hub_ai_modify_prop'
      : 'asset_hub_ai_modify_location'
  const streamContext = createWorkerLLMStreamContext(job, streamContextKey)
  const streamCallbacks = createWorkerLLMStreamCallbacks(job, streamContext)

  const completion = await withInternalLLMStreamCallbacks(
    streamCallbacks,
    async () =>
      await executeAiTextStep({
        userId: job.data.userId,
        model: userConfig.analysisModel!,
        messages: [{ role: 'user', content: finalPrompt }],
        temperature: 0.7,
        projectId: 'asset-hub',
        action: isCharacter ? 'ai_modify_character' : isProp ? 'ai_modify_prop' : 'ai_modify_location',
        meta: {
          stepId: streamContextKey,
          stepTitle: isCharacter ? '角色描述修改' : isProp ? '道具描述修改' : '场景描述修改',
          stepIndex: 1,
          stepTotal: 1,
        },
      }),
  )
  await streamCallbacks.flush()
  await assertTaskActive(job, 'asset_hub_ai_modify_parse')

  const parsed = parseJsonPrompt(completion.text)

  await reportTaskProgress(job, 96, {
    stage: 'asset_hub_ai_modify_done',
    stageLabel: '资产修改结果已生成',
    displayMode: 'detail',
    meta: {
      targetType: isCharacter ? 'character' : isProp ? 'prop' : 'location',
      targetId,
    },
  })

  return {
    success: true,
    modifiedDescription: parsed.prompt,
    availableSlots: parsed.availableSlots,
  }
}
