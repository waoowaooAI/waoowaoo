import type { Job } from 'bullmq'
import { safeParseJsonObject } from '@/lib/json-repair'
import { prisma } from '@/lib/prisma'
import { executeAiTextStep } from '@/lib/ai-exec/engine'
import { withInternalLLMStreamCallbacks } from '@/lib/llm-observe/internal-stream-context'
import { removeLocationPromptSuffix } from '@/lib/constants'
import { resolveProjectDirectorStyleDoc, resolveProjectVisualStylePreset } from '@/lib/style-preset'
import { reportTaskProgress } from '@/lib/workers/shared'
import { assertTaskActive } from '@/lib/workers/utils'
import { createWorkerLLMStreamCallbacks, createWorkerLLMStreamContext } from './llm-stream'
import type { TaskJobData } from '@/lib/task/types'
import { buildAiPrompt as buildPrompt, AI_PROMPT_IDS as PROMPT_IDS } from '@/lib/ai-prompts'
import { resolveAnalysisModel } from './resolve-analysis-model'
import { seedProjectLocationBackedImageSlots } from '@/lib/assets/services/location-backed-assets'
import { normalizeLocationAvailableSlots } from '@/lib/location-available-slots'
import { resolvePropVisualDescription } from '@/lib/assets/prop-description'

function readAssetKind(value: Record<string, unknown>): string {
  return typeof value.assetKind === 'string' ? value.assetKind : 'location'
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
}

/** 按别名匹配：按 '/' 拆分后任一别名精确匹配即为命中 */
function nameMatchesWithAlias(existingName: string, newName: string): boolean {
  const a = existingName.toLowerCase().trim()
  const b = newName.toLowerCase().trim()
  if (a === b) return true
  const aliasesA = a.split('/').map(s => s.trim()).filter(Boolean)
  const aliasesB = b.split('/').map(s => s.trim()).filter(Boolean)
  return aliasesB.some(alias => aliasesA.includes(alias))
}

function parseJsonResponse(responseText: string): Record<string, unknown> {
  return safeParseJsonObject(responseText)
}

export async function handleAnalyzeNovelTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as Record<string, unknown>
  const projectId = job.data.projectId

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
    },
  })
  if (!project) {
    throw new Error('Project not found')
  }

  const projectWorkflow = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      characters: true,
      locations: true,
    },
  })
  if (!projectWorkflow) throw new Error('Project not found')
  const analysisModel = await resolveAnalysisModel({
    userId: job.data.userId,
    inputModel: payload.model,
    projectAnalysisModel: projectWorkflow.analysisModel,
  })

  const firstEpisode = await prisma.projectEpisode.findFirst({
    where: { projectId: project.id },
    orderBy: { createdAt: 'asc' },
    select: {
      novelText: true,
    },
  })

  let contentToAnalyze = readText(projectWorkflow.globalAssetText) || readText(firstEpisode?.novelText)
  if (!contentToAnalyze.trim()) {
    throw new Error('请先填写全局资产设定或剧本内容')
  }

  const maxContentLength = 30000
  if (contentToAnalyze.length > maxContentLength) {
    contentToAnalyze = contentToAnalyze.substring(0, maxContentLength)
  }

  const charactersLibName = (projectWorkflow.characters || []).map((item) => item.name).join(', ')
  const locationsLibName = (projectWorkflow.locations || [])
    .filter((item) => readAssetKind(item as unknown as Record<string, unknown>) !== 'prop')
    .map((item) => item.name)
    .join(', ')
  const propsLibName = (projectWorkflow.locations || [])
    .filter((item) => readAssetKind(item as unknown as Record<string, unknown>) === 'prop')
    .map((item) => item.name)
    .join(', ')
  const directorStyleDoc = await resolveProjectDirectorStyleDoc({
    projectId,
    userId: job.data.userId,
  })
  const characterPromptTemplate = buildPrompt({
    promptId: PROMPT_IDS.CHARACTER_ANALYZE,
    locale: job.data.locale,
    variables: {
      input: contentToAnalyze,
      characters_lib_info: charactersLibName || '无',
    },
    directorStyleDoc,
  })
  const locationPromptTemplate = buildPrompt({
    promptId: PROMPT_IDS.LOCATION_ANALYZE,
    locale: job.data.locale,
    variables: {
      input: contentToAnalyze,
      locations_lib_name: locationsLibName || '无',
    },
    directorStyleDoc,
  })
  const propPromptTemplate = buildPrompt({
    promptId: PROMPT_IDS.PROP_ANALYZE,
    locale: job.data.locale,
    variables: {
      input: contentToAnalyze,
      props_lib_name: propsLibName || '无',
    },
    directorStyleDoc,
  })

  await reportTaskProgress(job, 20, {
    stage: 'analyze_novel_prepare',
    stageLabel: '准备资产分析参数',
    displayMode: 'detail',
  })
  await assertTaskActive(job, 'analyze_novel_prepare')

  const streamContext = createWorkerLLMStreamContext(job, 'analyze_novel')
  const streamCallbacks = createWorkerLLMStreamCallbacks(job, streamContext)
  const [characterCompletion, locationCompletion, propCompletion] = await (async () => {
    try {
      return await withInternalLLMStreamCallbacks(
        streamCallbacks,
        async () =>
          await Promise.all([
            executeAiTextStep({
              userId: job.data.userId,
              model: analysisModel,
              messages: [{ role: 'user', content: characterPromptTemplate }],
              temperature: 0.7,
              projectId,
              action: 'analyze_characters',
              meta: {
                stepId: 'analyze_characters',
                stepTitle: '角色分析',
                stepIndex: 1,
                stepTotal: 2,
              },
            }),
            executeAiTextStep({
              userId: job.data.userId,
              model: analysisModel,
              messages: [{ role: 'user', content: locationPromptTemplate }],
              temperature: 0.7,
              projectId,
              action: 'analyze_locations',
              meta: {
                stepId: 'analyze_locations',
                stepTitle: '场景分析',
                stepIndex: 2,
                stepTotal: 3,
              },
            }),
            executeAiTextStep({
              userId: job.data.userId,
              model: analysisModel,
              messages: [{ role: 'user', content: propPromptTemplate }],
              temperature: 0.7,
              projectId,
              action: 'analyze_props',
              meta: {
                stepId: 'analyze_props',
                stepTitle: '道具分析',
                stepIndex: 3,
                stepTotal: 3,
              },
            }),
          ]),
      )
    } finally {
      await streamCallbacks.flush()
    }
  })()

  const characterResponseText = characterCompletion.text
  const locationResponseText = locationCompletion.text
  const propResponseText = propCompletion.text

  await reportTaskProgress(job, 60, {
    stage: 'analyze_novel_characters_done',
    stageLabel: '角色分析完成',
    displayMode: 'detail',
    stepId: 'analyze_characters',
    stepTitle: '角色分析',
    stepIndex: 1,
    stepTotal: 3,
    done: true,
    output: characterResponseText,
  })

  await reportTaskProgress(job, 70, {
    stage: 'analyze_novel_locations_done',
    stageLabel: '场景分析完成',
    displayMode: 'detail',
    stepId: 'analyze_locations',
    stepTitle: '场景分析',
    stepIndex: 2,
    stepTotal: 3,
    done: true,
    output: locationResponseText,
  })

  await reportTaskProgress(job, 80, {
    stage: 'analyze_novel_props_done',
    stageLabel: '道具分析完成',
    displayMode: 'detail',
    stepId: 'analyze_props',
    stepTitle: '道具分析',
    stepIndex: 3,
    stepTotal: 3,
    done: true,
    output: propResponseText,
  })

  const charactersData = parseJsonResponse(characterResponseText)
  const locationsData = parseJsonResponse(locationResponseText)
  const propsData = parseJsonResponse(propResponseText)
  const parsedCharacters = Array.isArray(charactersData.characters)
    ? (charactersData.characters as Array<Record<string, unknown>>)
    : []
  const parsedLocations = Array.isArray(locationsData.locations)
    ? (locationsData.locations as Array<Record<string, unknown>>)
    : []
  const parsedProps = Array.isArray(propsData.props)
    ? (propsData.props as Array<Record<string, unknown>>)
    : []

  await reportTaskProgress(job, 75, {
    stage: 'analyze_novel_persist',
    stageLabel: '保存资产分析结果',
    displayMode: 'detail',
  })
  await assertTaskActive(job, 'analyze_novel_persist')

  const createdCharacters: Array<{ id: string }> = []
  for (const item of parsedCharacters) {
    const name = readText(item.name).trim()
    if (!name) continue

    const existsInLibrary = (projectWorkflow.characters || []).some(
      (character) => nameMatchesWithAlias(character.name, name),
    )
    if (existsInLibrary) continue

    const profileData = {
      role_level: item.role_level,
      archetype: item.archetype,
      personality_tags: toStringArray(item.personality_tags),
      era_period: item.era_period,
      social_class: item.social_class,
      occupation: item.occupation,
      costume_tier: item.costume_tier,
      suggested_colors: toStringArray(item.suggested_colors),
      primary_identifier: item.primary_identifier,
      visual_keywords: toStringArray(item.visual_keywords),
      gender: item.gender,
      age_range: item.age_range,
    }

    const created = await prisma.projectCharacter.create({
      data: {
        projectId: project.id,
        name,
        aliases: JSON.stringify(toStringArray(item.aliases)),
        profileData: JSON.stringify(profileData),
        profileConfirmed: false,
      },
      select: { id: true },
    })
    createdCharacters.push(created)
  }

  const createdLocations: Array<{ id: string }> = []
  for (const item of parsedLocations) {
    const name = readText(item.name).trim()
    if (!name) continue

    const descriptionsRaw = Array.isArray(item.descriptions)
      ? (item.descriptions as unknown[])
      : (readText(item.description) ? [readText(item.description)] : [])
    const descriptions = descriptionsRaw
      .map((value) => readText(value))
      .filter(Boolean)
    const firstDescription = descriptions[0] || ''
    const invalidKeywords = ['幻想', '抽象', '无明确', '空间锚点', '未说明', '不明确']
    const isInvalid = invalidKeywords.some((keyword) => name.includes(keyword) || firstDescription.includes(keyword))
    if (isInvalid) continue

    const existsInLibrary = (projectWorkflow.locations || []).some(
      (location) => readAssetKind(location as unknown as Record<string, unknown>) !== 'prop' && nameMatchesWithAlias(location.name, name),
    )
    if (existsInLibrary) continue

    const created = await prisma.projectLocation.create({
      data: {
        projectId: project.id,
        name,
        summary: readText(item.summary) || null,
      },
      select: { id: true },
    })

    const cleanDescriptions = descriptions.map((value) => removeLocationPromptSuffix(value || ''))
    const availableSlots = normalizeLocationAvailableSlots(item.available_slots)
    await seedProjectLocationBackedImageSlots({
      locationId: created.id,
      descriptions: cleanDescriptions,
      fallbackDescription: readText(item.summary) || name,
      availableSlots,
    })

    createdLocations.push(created)
  }

  const existingPropNameSet = new Set(
    (projectWorkflow.locations || [])
      .filter((item) => readAssetKind(item as unknown as Record<string, unknown>) === 'prop')
      .map((item) => item.name.toLowerCase()),
  )
  const createdProps: Array<{ id: string }> = []
  for (const item of parsedProps) {
    const name = readText(item.name).trim()
    const summary = readText(item.summary).trim()
    const description = resolvePropVisualDescription({
      name,
      summary,
      description: readText(item.description).trim(),
    })
    if (!name || !summary || !description) continue

    const normalizedName = name.toLowerCase()
    if (existingPropNameSet.has(normalizedName)) continue

    const created = await prisma.projectLocation.create({
      data: {
        projectId: project.id,
        name,
        summary,
        assetKind: 'prop',
      },
      select: { id: true },
    })
    await seedProjectLocationBackedImageSlots({
      locationId: created.id,
      descriptions: [description],
      fallbackDescription: description,
      availableSlots: [],
    })
    existingPropNameSet.add(normalizedName)
    createdProps.push(created)
  }

  const visualStyle = await resolveProjectVisualStylePreset({
    projectId,
    userId: job.data.userId,
    locale: job.data.locale,
  })

  await prisma.project.update({
    where: { id: project.id },
    data: {
      artStylePrompt: visualStyle.prompt || '',
    },
  })

  await reportTaskProgress(job, 96, {
    stage: 'analyze_novel_done',
    stageLabel: '资产分析已完成',
    displayMode: 'detail',
  })

  return {
    success: true,
    characters: createdCharacters,
    locations: createdLocations,
    props: createdProps,
    characterCount: createdCharacters.length,
    locationCount: createdLocations.length,
    propCount: createdProps.length,
  }
}
