import { type Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { resolveProjectVisualStylePreset } from '@/lib/style-preset'
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
  parseImageUrls,
  parsePanelCharacterReferences,
  pickFirstString,
  resolveNovelData,
} from './image-task-handler-shared'
import {
  findAppearanceForStoryboardReference,
  findCharacterForStoryboardReference,
  type StoryboardPanelCharacterReference,
} from '@/lib/storyboard-character-bindings'
import { buildAiPrompt as buildPrompt, AI_PROMPT_IDS as PROMPT_IDS } from '@/lib/ai-prompts'

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

function buildCharactersInfo(
  panel: { characters: string | null },
  projectData: { characters?: Array<{ id?: string; name: string; introduction?: string | null; appearances?: Array<{ id?: string; appearanceIndex?: number | null; changeReason?: string | null }> }> },
): string {
  const panelCharacters = parsePanelCharacterReferences(panel.characters)
  if (panelCharacters.length === 0) return '无角色'

  return panelCharacters.map(item => {
    const character = findCharacterForStoryboardReference(
      projectData.characters || [],
      item as StoryboardPanelCharacterReference,
    )
    const intro = character?.introduction || ''
    const appearance = item.appearance || '默认形象'
    const slotText = item.slot ? `，固定位置：${item.slot}` : ''
    return `- ${item.name}（${appearance}${slotText}）${intro ? `：${intro}` : ''}`
  }).join('\n')
}

function buildCharacterAssetsDescription(
  panel: { characters: string | null },
  projectData: { characters?: Array<{ id?: string; name: string; appearances?: Array<{ id?: string; appearanceIndex?: number | null; changeReason?: string | null; imageUrl?: string | null }> }> },
): string {
  const panelCharacters = parsePanelCharacterReferences(panel.characters)
  if (panelCharacters.length === 0) return '无角色参考图'

  return panelCharacters.map(item => {
    const character = findCharacterForStoryboardReference(
      projectData.characters || [],
      item as StoryboardPanelCharacterReference,
    )
    if (!character) return `- ${item.name}：角色未绑定资产`
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
      const character = findCharacterForStoryboardReference(
        params.projectData.characters || [],
        item as StoryboardPanelCharacterReference,
      )
      if (!character) {
        throw new Error(`PANEL_VARIANT_CHARACTER_REFERENCE_INVALID:${item.name || item.characterId || 'unknown'}:character_not_bound`)
      }

      const appearances = character.appearances || []
      const appearance = findAppearanceForStoryboardReference(
        appearances,
        item as StoryboardPanelCharacterReference,
      )
      if (!appearance) {
        throw new Error(`PANEL_VARIANT_CHARACTER_REFERENCE_INVALID:${character.name}:appearance_not_bound`)
      }
      const imageUrls = parseImageUrls((appearance as { imageUrls?: string | null }).imageUrls || null, 'characterAppearance.imageUrls')
      const selectedIndex = typeof (appearance as { selectedIndex?: number | null }).selectedIndex === 'number'
        ? (appearance as { selectedIndex?: number | null }).selectedIndex
        : null
      const selectedUrl = selectedIndex !== null && selectedIndex !== undefined
        ? imageUrls[selectedIndex]
        : imageUrls[0] || appearance.imageUrl || null
      if (!selectedUrl) {
        throw new Error(`PANEL_VARIANT_CHARACTER_REFERENCE_INVALID:${character.name}:reference_image_missing`)
      }
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

  const newPanel = await prisma.projectPanel.findUnique({ where: { id: newPanelId } })
  if (!newPanel) throw new Error('New panel not found (should have been created by API route)')

  const sourcePanel = await prisma.projectPanel.findUnique({ where: { id: sourcePanelId } })
  if (!sourcePanel) throw new Error('Source panel not found')

  const projectData = await resolveNovelData(job.data.projectId, job.data.userId)
  if (!projectData.videoRatio) throw new Error('Project videoRatio not configured')
  const aspectRatio = projectData.videoRatio

  const modelConfig = await getProjectModels(job.data.projectId, job.data.userId)
  const storyboardModel = modelConfig.storyboardModel
  if (!storyboardModel) throw new Error('Storyboard model not configured')

  const sourcePanelImageUrl = toSignedUrlIfCos(sourcePanel.imageUrl, 3600)
  const refs = buildVariantReferenceImages({
    includeCharacterAssets,
    includeLocationAsset,
    newPanel,
    sourcePanelImageUrl,
    projectData,
  })
  const normalizedRefs = await normalizeOptionalReferenceImagesForGeneration(refs, {
    context: { taskType: String(job.data.type), scope: 'panel-variant.refs' },
  })

  const artStyle = (await resolveProjectVisualStylePreset({
    projectId: job.data.projectId,
    userId: job.data.userId,
    locale: job.data.locale,
  })).prompt
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
    style: artStyle,
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
