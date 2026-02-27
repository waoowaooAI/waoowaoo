import { type Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { getArtStylePrompt } from '@/lib/constants'
import { logInfo as _ulogInfo } from '@/lib/logging/core'
import { type TaskJobData } from '@/lib/task/types'
import {
  assertTaskActive,
  getProjectModels,
  resolveImageSourceFromGeneration,
  toSignedUrlIfCos,
  uploadImageSourceToCos,
} from '../utils'
import { normalizeReferenceImagesForGeneration } from '@/lib/media/outbound-image'
import {
  AnyObj,
  collectPanelReferenceImages,
  findCharacterByName,
  parsePanelCharacterReferences,
  pickFirstString,
  resolveNovelData,
} from './image-task-handler-shared'
import { buildPrompt, PROMPT_IDS } from '@/lib/prompt-i18n'

// ── 构建变体提示词 ──────────────────────────────────────
interface VariantPromptParams {
  locale: TaskJobData['locale']
  originalDescription: string
  originalShotType: string
  originalCameraMove: string
  location: string
  charactersInfo: string
  variantTitle: string
  variantDescription: string
  targetShotType: string
  targetCameraMove: string
  videoPrompt: string
  characterAssets: string
  locationAsset: string
  aspectRatio: string
  style: string
}

function buildVariantPrompt(params: VariantPromptParams): string {
  return buildPrompt({
    promptId: PROMPT_IDS.NP_AGENT_SHOT_VARIANT_GENERATE,
    locale: params.locale,
    variables: {
      original_description: params.originalDescription,
      original_shot_type: params.originalShotType,
      original_camera_move: params.originalCameraMove,
      location: params.location,
      characters_info: params.charactersInfo,
      variant_title: params.variantTitle,
      variant_description: params.variantDescription,
      target_shot_type: params.targetShotType,
      target_camera_move: params.targetCameraMove,
      video_prompt: params.videoPrompt,
      character_assets: params.characterAssets,
      location_asset: params.locationAsset,
      aspect_ratio: params.aspectRatio,
      style: params.style,
    },
  })
}

// ── 构建角色和场景描述信息 ─────────────────────────────
function buildCharactersInfo(
  panel: { characters: string | null },
  projectData: { characters?: Array<{ name: string; introduction?: string | null; appearances?: Array<{ changeReason?: string | null }> }> },
): string {
  const panelCharacters = parsePanelCharacterReferences(panel.characters)
  if (panelCharacters.length === 0) return '无角色'

  return panelCharacters.map(item => {
    const character = findCharacterByName(projectData.characters || [], item.name)
    const intro = character?.introduction || ''
    const appearance = item.appearance || '默认形象'
    return `- ${item.name}（${appearance}）${intro ? `：${intro}` : ''}`
  }).join('\n')
}

function buildCharacterAssetsDescription(
  panel: { characters: string | null },
  projectData: { characters?: Array<{ name: string; appearances?: Array<{ changeReason?: string | null; imageUrl?: string | null }> }> },
): string {
  const panelCharacters = parsePanelCharacterReferences(panel.characters)
  if (panelCharacters.length === 0) return '无角色参考图'

  return panelCharacters.map(item => {
    const character = findCharacterByName(projectData.characters || [], item.name)
    if (!character) return `- ${item.name}：无参考图`
    const hasAppearance = (character.appearances || []).length > 0
    return `- ${item.name}：${hasAppearance ? '已提供参考图' : '无参考图'}`
  }).join('\n')
}

interface PanelVariantPayload {
  shot_type?: string
  camera_move?: string
  description?: string
  video_prompt?: string
  title?: string
  location?: string
  characters?: unknown
}

export async function handlePanelVariantTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as AnyObj
  const newPanelId = pickFirstString(payload.newPanelId)
  const sourcePanelId = pickFirstString(payload.sourcePanelId)
  const variant: PanelVariantPayload = payload.variant && typeof payload.variant === 'object'
    ? (payload.variant as PanelVariantPayload)
    : {}

  if (!newPanelId || !sourcePanelId) {
    throw new Error('panel_variant missing newPanelId/sourcePanelId')
  }

  // Panel 已在 API route 中创建，这里只需获取它
  const newPanel = await prisma.novelPromotionPanel.findUnique({ where: { id: newPanelId } })
  if (!newPanel) throw new Error('New panel not found (should have been created by API route)')

  const sourcePanel = await prisma.novelPromotionPanel.findUnique({ where: { id: sourcePanelId } })
  if (!sourcePanel) throw new Error('Source panel not found')

  const projectData = await resolveNovelData(job.data.projectId)
  if (!projectData.videoRatio) throw new Error('Project videoRatio not configured')
  const aspectRatio = projectData.videoRatio

  const modelConfig = await getProjectModels(job.data.projectId, job.data.userId)
  const storyboardModel = modelConfig.storyboardModel
  if (!storyboardModel) throw new Error('Storyboard model not configured')

  // 收集参考图（与 panel-image-task-handler 共用同一链路）
  const refs = await collectPanelReferenceImages(projectData, newPanel)
  // 额外加入源镜头图片作为参考
  const sourcePanelImageUrl = toSignedUrlIfCos(sourcePanel.imageUrl, 3600)
  if (sourcePanelImageUrl) refs.unshift(sourcePanelImageUrl)
  const normalizedRefs = await normalizeReferenceImagesForGeneration(refs)

  // 使用 agent_shot_variant_generate.txt 提示词模板
  const artStyle = getArtStylePrompt(modelConfig.artStyle, job.data.locale)
  const charactersInfo = buildCharactersInfo(newPanel, projectData)
  const characterAssetsDesc = buildCharacterAssetsDescription(newPanel, projectData)
  const locationName = newPanel.location || sourcePanel.location || ''

  const prompt = buildVariantPrompt({
    locale: job.data.locale,
    originalDescription: sourcePanel.description || '',
    originalShotType: sourcePanel.shotType || '',
    originalCameraMove: sourcePanel.cameraMove || '',
    location: locationName,
    charactersInfo,
    variantTitle: pickFirstString(variant.title) || '镜头变体',
    variantDescription: variant.description || '',
    targetShotType: variant.shot_type || sourcePanel.shotType || '',
    targetCameraMove: variant.camera_move || sourcePanel.cameraMove || '',
    videoPrompt: pickFirstString(variant.video_prompt, variant.description) || '',
    characterAssets: characterAssetsDesc,
    locationAsset: locationName ? `场景：${locationName}` : '无场景参考',
    aspectRatio,
    style: artStyle || '与参考图风格一致',
  })

  _ulogInfo('[panel-variant] resolved variant prompt', prompt)

  await assertTaskActive(job, 'generate_panel_variant_image')
  const source = await resolveImageSourceFromGeneration(job, {
    userId: job.data.userId,
    modelId: storyboardModel,
    prompt,
    options: {
      referenceImages: normalizedRefs,
      aspectRatio,
    },
  })

  const cosKey = await uploadImageSourceToCos(source, 'panel-variant', newPanel.id)

  await assertTaskActive(job, 'persist_panel_variant')
  await prisma.novelPromotionPanel.update({
    where: { id: newPanel.id },
    data: { imageUrl: cosKey },
  })

  return {
    panelId: newPanel.id,
    storyboardId: newPanel.storyboardId,
    imageUrl: cosKey,
  }
}
