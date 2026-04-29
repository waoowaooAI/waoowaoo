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
import { normalizeOptionalReferenceImagesForGeneration } from '@/lib/media/outbound-image'
import {
  formatLocationAvailableSlotsText,
  parseLocationAvailableSlots,
} from '@/lib/location-available-slots'
import {
  AnyObj,
  findCharacterByName,
  parseImageUrls,
  parsePanelCharacterReferences,
  pickFirstString,
  resolveNovelData,
} from './image-task-handler-shared'
import { buildAiPrompt as buildPrompt, AI_PROMPT_IDS as PROMPT_IDS } from '@/lib/ai-prompts'

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
  directorStyleDoc?: Awaited<ReturnType<typeof resolveNovelData>>['directorStyleDoc']
}

function buildVariantPrompt(params: VariantPromptParams): string {
  return buildPrompt({
    promptId: PROMPT_IDS.SHOT_VARIANT_GENERATE,
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
    directorStyleDoc: params.directorStyleDoc,
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
    const slotText = item.slot ? `，固定位置：${item.slot}` : ''
    return `- ${item.name}（${appearance}${slotText}）${intro ? `：${intro}` : ''}`
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

function buildLocationAssetDescription(params: {
  includeLocationAsset: boolean
  locationName: string
  locale: TaskJobData['locale']
  projectData: Awaited<ReturnType<typeof resolveNovelData>>
}): string {
  if (params.locationName) {
    if (params.includeLocationAsset) {
      const location = (params.projectData.locations || []).find(
        (item) => item.name.toLowerCase() === params.locationName.toLowerCase(),
      )
      const selectedImage = location?.images?.find((image) => image.isSelected) ?? location?.images?.[0]
      const description = selectedImage?.description?.trim()
      const slotsText = formatLocationAvailableSlotsText(
        parseLocationAvailableSlots(selectedImage?.availableSlots),
        params.locale,
      )
      const parts = [
        params.locale === 'en' ? `Location: ${params.locationName}` : `场景：${params.locationName}`,
      ]
      if (description) {
        parts.push(params.locale === 'en' ? `Scene description: ${description}` : `场景描述：${description}`)
      }
      if (slotsText) parts.push(slotsText)
      return parts.join('\n')
    }
    return params.locale === 'en' ? 'Location reference disabled' : '未使用场景参考图'
  }
  return params.locale === 'en' ? 'No location reference' : '无场景参考'
}

function buildVariantReferenceImages(params: {
  includeCharacterAssets: boolean
  includeLocationAsset: boolean
  newPanel: {
    characters: string | null
    location: string | null
  }
  sourcePanelImageUrl: string | null
  projectData: Awaited<ReturnType<typeof resolveNovelData>>
}): string[] {
  const refs: string[] = []
  if (params.sourcePanelImageUrl) refs.push(params.sourcePanelImageUrl)

  if (params.includeCharacterAssets) {
    const panelCharacters = parsePanelCharacterReferences(params.newPanel.characters)
    for (const item of panelCharacters) {
      const character = findCharacterByName(params.projectData.characters || [], item.name)
      if (!character) continue

      const appearances = character.appearances || []
      let appearance = appearances[0]
      if (item.appearance) {
        const matched = appearances.find((candidate) => (candidate.changeReason || '').toLowerCase() === item.appearance!.toLowerCase())
        if (matched) appearance = matched
      }

      if (!appearance) continue
      const imageUrls = parseImageUrls((appearance as { imageUrls?: string | null }).imageUrls || null, 'characterAppearance.imageUrls')
      const selectedIndex = typeof (appearance as { selectedIndex?: number | null }).selectedIndex === 'number'
        ? (appearance as { selectedIndex?: number | null }).selectedIndex
        : null
      const selectedUrl = (selectedIndex !== null && selectedIndex !== undefined ? imageUrls[selectedIndex] : null)
        || imageUrls[0]
        || appearance.imageUrl
        || null
      const signed = toSignedUrlIfCos(selectedUrl, 3600)
      if (signed) refs.push(signed)
    }
  }

  if (params.includeLocationAsset && params.newPanel.location) {
    const location = (params.projectData.locations || []).find(
      (item) => item.name.toLowerCase() === params.newPanel.location!.toLowerCase(),
    )
    if (location) {
      const selected = (location.images || []).find((image) => image.isSelected) || location.images?.[0]
      const signed = toSignedUrlIfCos(selected?.imageUrl, 3600)
      if (signed) refs.push(signed)
    }
  }

  return refs
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
  const includeCharacterAssets = payload.includeCharacterAssets !== false
  const includeLocationAsset = payload.includeLocationAsset !== false
  const variant: PanelVariantPayload = payload.variant && typeof payload.variant === 'object'
    ? (payload.variant as PanelVariantPayload)
    : {}

  if (!newPanelId || !sourcePanelId) {
    throw new Error('panel_variant missing newPanelId/sourcePanelId')
  }

  // Panel 已在 API route 中创建，这里只需获取它
  const newPanel = await prisma.projectPanel.findUnique({ where: { id: newPanelId } })
  if (!newPanel) throw new Error('New panel not found (should have been created by API route)')

  const sourcePanel = await prisma.projectPanel.findUnique({ where: { id: sourcePanelId } })
  if (!sourcePanel) throw new Error('Source panel not found')

  const projectData = await resolveNovelData(job.data.projectId)
  if (!projectData.videoRatio) throw new Error('Project videoRatio not configured')
  const aspectRatio = projectData.videoRatio

  const modelConfig = await getProjectModels(job.data.projectId, job.data.userId)
  const storyboardModel = modelConfig.storyboardModel
  if (!storyboardModel) throw new Error('Storyboard model not configured')

  // 收集参考图（与 panel-image-task-handler 共用同一链路）
  const sourcePanelImageUrl = toSignedUrlIfCos(sourcePanel.imageUrl, 3600)
  const refs = buildVariantReferenceImages({
    includeCharacterAssets,
    includeLocationAsset,
    newPanel,
    sourcePanelImageUrl,
    projectData,
  })
  const normalizedRefs = await normalizeOptionalReferenceImagesForGeneration(refs, {
    context: {
      taskType: 'image_panel_variant',
      newPanelId,
      sourcePanelId,
      targetId: job.data.targetId,
    },
  })

  // 使用 agent_shot_variant_generate.txt 提示词模板
  const artStyle = getArtStylePrompt(modelConfig.artStyle, job.data.locale)
  const charactersInfo = buildCharactersInfo(newPanel, projectData)
  const characterAssetsDesc = includeCharacterAssets
    ? buildCharacterAssetsDescription(newPanel, projectData)
    : (job.data.locale === 'en' ? 'Character reference images disabled' : '未使用角色参考图')
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
    locationAsset: buildLocationAssetDescription({
      includeLocationAsset,
      locationName,
      locale: job.data.locale,
      projectData,
    }),
    aspectRatio,
    style: artStyle || '与参考图风格一致',
    directorStyleDoc: projectData.directorStyleDoc,
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
  await prisma.projectPanel.update({
    where: { id: newPanel.id },
    data: { imageUrl: cosKey },
  })

  return {
    panelId: newPanel.id,
    storyboardId: newPanel.storyboardId,
    imageUrl: cosKey,
  }
}
