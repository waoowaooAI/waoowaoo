import sharp from 'sharp'
import type { Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { generateImage } from '@/lib/ai-exec/engine'
import { fetchGeneratedMediaWithRetry } from '@/lib/ai-exec/media-result'
import { executeAiVisionStep } from '@/lib/ai-exec/engine'
import { getUserModelConfig } from '@/lib/config-service'
import {
  CHARACTER_IMAGE_BANANA_RATIO,
  addCharacterPromptSuffix,
} from '@/lib/constants'
import { resolveProjectImageStyleForTask, resolveSystemImageStylePrompt } from '@/lib/image-generation/style'
import { encodeImageUrls } from '@/lib/contracts/image-urls-contract'
import { generateUniqueKey, getSignedUrl, uploadObject } from '@/lib/storage'
import { initializeFonts, createLabelSVG } from '@/lib/fonts'
import { reportTaskProgress } from '@/lib/workers/shared'
import { assertTaskActive, waitExternalResult } from '@/lib/workers/utils'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'
import { buildAiPrompt as buildPrompt, AI_PROMPT_IDS as PROMPT_IDS } from '@/lib/ai-prompts'
import { normalizeImageGenerationCount } from '@/lib/image-generation/count'
import {
  parseReferenceImages,
  readBoolean,
  readString,
} from './reference-to-character-helpers'

async function generateReferenceImage(params: {
  job: Job<TaskJobData>
  imageIndex: number
  userId: string
  imageModel: string
  prompt: string
  referenceImages?: string[]
  keyPrefix: string
  labelText?: string
}): Promise<string | null> {
  const {
    job,
    imageIndex,
    userId,
    imageModel,
    prompt,
    referenceImages,
    keyPrefix,
    labelText,
  } = params

  try {
    await assertTaskActive(job, `reference_to_character_generate_${imageIndex + 1}`)
    const options: {
      referenceImages?: string[]
      aspectRatio: string
    } = {
      aspectRatio: CHARACTER_IMAGE_BANANA_RATIO,
    }
    if (referenceImages && referenceImages.length > 0) {
      options.referenceImages = referenceImages
    }

    const result = await generateImage(
      userId,
      imageModel,
      prompt,
      options,
    )

    let finalImageUrl = result.imageUrl
    if (result.async) {
      const externalId = result.externalId
        ?? (result.endpoint && result.requestId ? `FAL:IMAGE:${result.endpoint}:${result.requestId}` : null)
      if (!externalId) {
        return null
      }
      try {
        const polled = await waitExternalResult(job, externalId, userId, {
          progressStart: 40,
          progressEnd: 85,
        })
        finalImageUrl = polled.url
      } catch {
        return null
      }
    }

    if (!result.success || !finalImageUrl) {
      return null
    }

    const imgRes = await fetchGeneratedMediaWithRetry(finalImageUrl, {
      logPrefix: `[reference-to-character:${imageIndex + 1}]`,
    })
    const buffer = Buffer.from(await imgRes.arrayBuffer())
    const processed = labelText
      ? await (async () => {
        const meta = await sharp(buffer).metadata()
        const width = meta.width || 2160
        const height = meta.height || 2160
        const fontSize = Math.floor(height * 0.04)
        const pad = Math.floor(fontSize * 0.5)
        const barHeight = fontSize + pad * 2
        const svg = await createLabelSVG(width, barHeight, fontSize, pad, labelText)
        return await sharp(buffer)
          .extend({
            top: barHeight,
            bottom: 0,
            left: 0,
            right: 0,
            background: { r: 0, g: 0, b: 0, alpha: 1 },
          })
          .composite([{ input: svg, top: 0, left: 0 }])
          .jpeg({ quality: 90, mozjpeg: true })
          .toBuffer()
      })()
      : await sharp(buffer)
        .jpeg({ quality: 90, mozjpeg: true })
        .toBuffer()

    const key = generateUniqueKey(`${keyPrefix}-${Date.now()}-${imageIndex}`, 'jpg')
    return await uploadObject(processed, key)
  } catch {
    return null
  }
}

export async function handleReferenceToCharacterTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as Record<string, unknown>
  const allReferenceImages = parseReferenceImages(payload)
  if (allReferenceImages.length === 0) {
    throw new Error('Missing referenceImageUrl or referenceImageUrls')
  }

  const isAssetHub = job.data.type === TASK_TYPE.ASSET_HUB_REFERENCE_TO_CHARACTER
  const isProject = job.data.type === TASK_TYPE.REFERENCE_TO_CHARACTER
  if (!isAssetHub && !isProject) {
    throw new Error(`Unsupported task type: ${job.data.type}`)
  }

  const isBackgroundJob = readBoolean(payload.isBackgroundJob)
  const appearanceId = readString(payload.appearanceId)
  const characterId = readString(payload.characterId)
  const extractOnly = readBoolean(payload.extractOnly)
  const customDescription = readString(payload.customDescription)
  const characterName = readString(payload.characterName) || '新角色 - 初始形象'
  const artStyle = readString(payload.artStyle)

  if (isBackgroundJob && (!characterId || !appearanceId)) {
    throw new Error('Missing characterId or appearanceId for background job')
  }

  await reportTaskProgress(job, 15, {
    stage: 'reference_to_character_prepare',
    stageLabel: '准备参考图转换参数',
    displayMode: 'detail',
  })
  await assertTaskActive(job, 'reference_to_character_prepare')
  if (isProject) {
    await initializeFonts()
  }

  const userConfig = await getUserModelConfig(job.data.userId)
  const imageModel = readString(userConfig.characterModel)
  const analysisModel = readString(userConfig.analysisModel)
  if (!imageModel && !extractOnly) {
    throw new Error('请先在设置页面配置角色图片模型')
  }
  if (!analysisModel && extractOnly) {
    throw new Error('请先在设置页面配置分析模型')
  }

  if (extractOnly) {
    await reportTaskProgress(job, 45, {
      stage: 'reference_to_character_extract',
      stageLabel: '提取参考图描述',
      displayMode: 'detail',
    })
    const completion = await executeAiVisionStep({
      userId: job.data.userId,
      model: analysisModel,
      prompt: buildPrompt({
        promptId: PROMPT_IDS.CHARACTER_REFERENCE_DESCRIBE_IMAGE,
        locale: job.data.locale,
      }),
      imageUrls: allReferenceImages,
      temperature: 0.3,
      ...(isProject ? { projectId: job.data.projectId } : {}),
    })
    await assertTaskActive(job, 'reference_to_character_extract_done')
    await reportTaskProgress(job, 96, {
      stage: 'reference_to_character_extract_done',
      stageLabel: '参考图描述提取完成',
      displayMode: 'detail',
    })
    return {
      success: true,
      description: completion.text,
    }
  }

  const artStylePrompt = isProject
    ? (await resolveProjectImageStyleForTask({
        projectId: job.data.projectId,
        userId: job.data.userId,
        locale: job.data.locale,
        artStyleOverride: artStyle,
        invalidOverrideMessage: 'Invalid artStyle in REFERENCE_TO_CHARACTER payload',
      })).prompt
    : resolveSystemImageStylePrompt({
        artStyle,
        locale: job.data.locale,
        errorMessage: 'Invalid artStyle in ASSET_HUB_REFERENCE_TO_CHARACTER payload',
      })

  const basePrompt = customDescription || buildPrompt({
    promptId: PROMPT_IDS.CHARACTER_REFERENCE_TO_SHEET,
    locale: job.data.locale,
  })
  let prompt = addCharacterPromptSuffix(basePrompt)
  if (artStylePrompt) {
    prompt = `${prompt}，${artStylePrompt}`
  }

  const useReferenceImages = !customDescription
  const keyPrefix = isAssetHub ? 'ref-char' : `proj-ref-char-${job.data.projectId}`
  const count = normalizeImageGenerationCount('reference-to-character', payload.count)

  await reportTaskProgress(job, 35, {
    stage: 'reference_to_character_generate',
    stageLabel: '生成角色三视图',
    displayMode: 'detail',
  })

  const imageResults = await Promise.all(Array.from({ length: count }, (_value, index) => index).map(async (index) =>
    await generateReferenceImage({
      job,
      imageIndex: index,
      userId: job.data.userId,
      imageModel,
      prompt,
      ...(useReferenceImages ? { referenceImages: allReferenceImages } : {}),
      keyPrefix,
      ...(isProject ? { labelText: characterName } : {}),
    }),
  ))

  const successfulCosKeys = imageResults.filter((item): item is string => Boolean(item))
  if (successfulCosKeys.length === 0) {
    throw new Error('图片生成失败')
  }

  await assertTaskActive(job, 'reference_to_character_persist')
  if (isBackgroundJob && appearanceId) {
    if (isAssetHub) {
      await prisma.globalCharacterAppearance.update({
        where: { id: appearanceId },
        data: {
          imageUrl: successfulCosKeys[0],
          imageUrls: encodeImageUrls(successfulCosKeys),
        },
      })
    } else {
      await prisma.characterAppearance.update({
        where: { id: appearanceId },
        data: {
          imageUrl: successfulCosKeys[0],
          imageUrls: encodeImageUrls(successfulCosKeys),
        },
      })
    }
    await reportTaskProgress(job, 96, {
      stage: 'reference_to_character_done',
      stageLabel: '参考图转换完成',
      displayMode: 'detail',
    })
    return { success: true }
  }

  const mainCosKey = successfulCosKeys[0]
  const mainSignedUrl = getSignedUrl(mainCosKey, 7 * 24 * 3600)

  await reportTaskProgress(job, 96, {
    stage: 'reference_to_character_done',
    stageLabel: '参考图转换完成',
    displayMode: 'detail',
  })

  return {
    success: true,
    imageUrl: mainSignedUrl,
    cosKey: mainCosKey,
    cosKeys: successfulCosKeys,
  }
}
