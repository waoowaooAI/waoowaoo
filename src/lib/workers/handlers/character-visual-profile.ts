import type { Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { executeAiTextStep } from '@/lib/ai-exec/engine'
import { encodeImageUrls } from '@/lib/contracts/image-urls-contract'
import { validateProfileData, stringifyProfileData } from '@/types/character-profile'
import { withInternalLLMStreamCallbacks } from '@/lib/llm-observe/internal-stream-context'
import { reportTaskProgress } from '@/lib/workers/shared'
import { assertTaskActive } from '@/lib/workers/utils'
import type { TaskJobData } from '@/lib/task/types'
import {
  type AnyObj,
  parseVisualResponse,
  readText,
  resolveProjectModel,
} from './character-visual-profile-helpers'
import { createWorkerLLMStreamCallbacks, createWorkerLLMStreamContext } from './llm-stream'
import { buildAiPrompt as buildPrompt, AI_PROMPT_IDS as PROMPT_IDS } from '@/lib/ai-prompts'

type GenerateCharacterVisualProfileInput = {
  characterId: string
  profileData?: unknown
}

type GenerateCharacterVisualProfileOptions = {
  suppressProgress?: boolean
}

export async function generateCharacterVisualProfile(
  job: Job<TaskJobData>,
  input: GenerateCharacterVisualProfileInput,
  options: GenerateCharacterVisualProfileOptions = {},
) {
  const suppressProgress = options.suppressProgress === true
  const characterId = input.characterId.trim()
  if (!characterId) {
    throw new Error('characterId is required')
  }
  const project = await resolveProjectModel(job.data.projectId)

  const character = await prisma.projectCharacter.findFirst({
    where: {
      id: characterId,
      projectId: project.projectId,
    },
  })
  if (!character) {
    throw new Error('Character not found')
  }

  let finalProfileData = character.profileData
  if (input.profileData) {
    if (!validateProfileData(input.profileData)) {
      throw new Error('档案数据格式错误')
    }
    finalProfileData = stringifyProfileData(input.profileData)
    await assertTaskActive(job, 'character_visual_profile_update_profile')
    await prisma.projectCharacter.update({
      where: { id: characterId },
      data: { profileData: finalProfileData },
    })
  }

  if (!finalProfileData) {
    throw new Error('角色缺少档案数据')
  }

  const parsedProfile = JSON.parse(finalProfileData) as AnyObj
  const promptTemplate = buildPrompt({
    promptId: PROMPT_IDS.CHARACTER_VISUAL_PROFILE,
    locale: job.data.locale,
    variables: {
      character_profiles: JSON.stringify(
        [
          {
            name: character.name,
            ...parsedProfile,
          },
        ],
        null,
        2,
      ),
    },
  })

  if (!suppressProgress) {
    await reportTaskProgress(job, 20, {
      stage: 'character_visual_profile_prepare',
      stageLabel: '准备角色视觉档案参数',
      displayMode: 'detail',
    })
  }
  await assertTaskActive(job, 'character_visual_profile_prepare')

  const streamContext = createWorkerLLMStreamContext(job, 'character_visual_profile')
  const streamCallbacks = createWorkerLLMStreamCallbacks(job, streamContext)
  const completion = await withInternalLLMStreamCallbacks(
    streamCallbacks,
    async () =>
      await executeAiTextStep({
        userId: job.data.userId,
        model: project.analysisModel,
        messages: [{ role: 'user', content: promptTemplate }],
        temperature: 0.7,
        projectId: job.data.projectId,
        action: 'generate_character_visual',
        meta: {
          stepId: 'character_visual_profile',
          stepTitle: '角色视觉档案生成',
          stepIndex: 1,
          stepTotal: 1,
        },
      }),
  )
  await streamCallbacks.flush()
  await assertTaskActive(job, 'character_visual_profile_parse')

  const responseText = completion.text
  const visualData = parseVisualResponse(responseText)
  const visualCharacters = Array.isArray(visualData.characters)
    ? (visualData.characters as Array<AnyObj>)
    : []
  const firstCharacter = visualCharacters[0]
  const appearances = Array.isArray(firstCharacter?.appearances)
    ? (firstCharacter.appearances as Array<AnyObj>)
    : []
  if (appearances.length === 0) {
    throw new Error('AI返回格式错误: 缺少 appearances')
  }

  if (!suppressProgress) {
    await reportTaskProgress(job, 78, {
      stage: 'character_visual_profile_persist',
      stageLabel: '保存角色视觉档案结果',
      displayMode: 'detail',
    })
  }
  await assertTaskActive(job, 'character_visual_profile_persist')

  const appearanceRows: Array<{
    characterId: string
    appearanceIndex: number
    changeReason: string
    description: string
    descriptions: string
    imageUrls: string
    previousImageUrls: string
  }> = []

  for (let appIndex = 0; appIndex < appearances.length; appIndex += 1) {
    const app = appearances[appIndex]
    await assertTaskActive(job, 'character_visual_profile_create_appearance')
    const descriptions = Array.isArray(app.descriptions) ? app.descriptions : []
    const normalizedDescriptions = descriptions.map((item) => readText(item)).filter(Boolean)
    appearanceRows.push({
      characterId: character.id,
      appearanceIndex: appIndex,
      changeReason: readText(app.change_reason) || '初始形象',
      description: normalizedDescriptions[0] || '',
      descriptions: JSON.stringify(normalizedDescriptions),
      imageUrls: encodeImageUrls([]),
      previousImageUrls: encodeImageUrls([]),
    })
  }

  await prisma.$transaction(async (tx) => {
    await tx.characterAppearance.deleteMany({
      where: { characterId: character.id },
    })

    for (const appearanceRow of appearanceRows) {
      await tx.characterAppearance.create({
        data: appearanceRow,
      })
    }

    await tx.projectCharacter.update({
      where: { id: characterId },
      data: {
        profileData: finalProfileData,
        profileConfirmed: true,
      },
    })
  })

  if (!suppressProgress) {
    await reportTaskProgress(job, 96, {
      stage: 'character_visual_profile_done',
      stageLabel: '角色视觉档案生成完成',
      displayMode: 'detail',
      meta: { characterId },
    })
  }

  return {
    success: true,
    character: {
      ...character,
      profileConfirmed: true,
      appearances,
    },
  }
}

export async function generateCreatedCharacterVisualProfile(
  job: Job<TaskJobData>,
  characterId: string,
  options: GenerateCharacterVisualProfileOptions = {},
) {
  try {
    return await generateCharacterVisualProfile(job, { characterId }, options)
  } catch (error) {
    await prisma.projectCharacter.delete({
      where: { id: characterId },
    })
    throw error
  }
}
