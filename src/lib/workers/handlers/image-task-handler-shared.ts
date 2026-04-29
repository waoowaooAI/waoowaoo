import { type Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { type TaskJobData } from '@/lib/task/types'
import { decodeImageUrlsFromDb } from '@/lib/contracts/image-urls-contract'
import type { DirectorStyleDoc } from '@/lib/director-style'
import { parseDirectorStyleDoc } from '@/lib/director-style'
import { resolveProjectDirectorStyleDoc } from '@/lib/style-preset'
import {
  findAppearanceForStoryboardReference,
  findCharacterForStoryboardReference,
  parseStoryboardPanelCharacterReferences,
  type StoryboardPanelCharacterReference,
} from '@/lib/storyboard-character-bindings'
import {
  resolveImageSourceFromGeneration,
  toSignedUrlIfCos,
  uploadImageSourceToCos,
  withLabelBar,
} from '../utils'

export type AnyObj = Record<string, unknown>

interface CharacterAppearanceLike {
  id?: string
  appearanceIndex?: number
  changeReason: string | null
  description?: string | null
  descriptions?: string | null
  imageUrls: string | null
  imageUrl: string | null
  selectedIndex: number | null
}

interface CharacterLike {
  id?: string
  name: string
  appearances?: CharacterAppearanceLike[]
}

interface LocationImageLike {
  description?: string | null
  availableSlots?: string | null
  imageIndex?: number
  isSelected: boolean
  imageUrl: string | null
}

interface LocationLike {
  name: string
  images?: LocationImageLike[]
}

interface NovelProjectData {
  videoRatio?: string | null
  directorStyleDoc?: DirectorStyleDoc | null
  characters?: CharacterLike[]
  locations?: LocationLike[]
}

interface PanelLike {
  sketchImageUrl?: string | null
  characters?: string | null
  location?: string | null
}

export interface PanelCharacterReference {
  characterId?: string
  name: string
  appearanceId?: string
  appearanceIndex?: number
  appearance?: string
  slot?: string
}

export type PanelReferenceImageDiagnostic = {
  kind: 'sketch' | 'character' | 'location'
  inputIndex: number | null
  name?: string | null
  characterId?: string | null
  appearance?: string | null
  appearanceId?: string | null
  selectedIndex?: number | null
  sourceUrl?: string | null
  signedUrl?: string | null
  issue?: string | null
}

export type PanelReferenceImageCollection = {
  refs: string[]
  diagnostics: PanelReferenceImageDiagnostic[]
  issues: PanelReferenceImageDiagnostic[]
  expectedCharacterReferenceCount: number
}

interface ProjectDataDb {
  project: {
    findUnique(args: Record<string, unknown>): Promise<NovelProjectData | null>
  }
}

export function parseJsonStringArray(value: unknown): string[] {
  if (!value) return []
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string')
  }
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string')
  } catch {
    return []
  }
}

export function parseImageUrls(value: string | null | undefined, fieldName: string): string[] {
  return decodeImageUrlsFromDb(value, fieldName)
}

export function clampCount(value: unknown, min: number, max: number, fallback: number) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.floor(n)))
}

export function pickFirstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value
  }
  return null
}

async function generateImageToStorage(params: {
  job: Job<TaskJobData>
  userId: string
  modelId: string
  prompt: string
  targetId: string
  keyPrefix: string
  options?: {
    referenceImages?: string[]
    aspectRatio?: string
    size?: string
  }
  label?: string
}) {
  const source = await resolveImageSourceFromGeneration(params.job, {
    userId: params.userId,
    modelId: params.modelId,
    prompt: params.prompt,
    options: params.options,
  })

  const uploadSource = params.label
    ? await withLabelBar(source, params.label)
    : source
  const cosKey = await uploadImageSourceToCos(uploadSource, params.keyPrefix, params.targetId)
  return cosKey
}

export async function generateCleanImageToStorage(params: {
  job: Job<TaskJobData>
  userId: string
  modelId: string
  prompt: string
  targetId: string
  keyPrefix: string
  options?: {
    referenceImages?: string[]
    aspectRatio?: string
    size?: string
  }
}) {
  return await generateImageToStorage(params)
}

export async function generateProjectLabeledImageToStorage(params: {
  job: Job<TaskJobData>
  userId: string
  modelId: string
  prompt: string
  label: string
  targetId: string
  keyPrefix: string
  options?: {
    referenceImages?: string[]
    aspectRatio?: string
    size?: string
  }
}) {
  return await generateImageToStorage(params)
}

export async function resolveNovelData(projectId: string, userId?: string) {
  const db = prisma as unknown as ProjectDataDb
  const data = await db.project.findUnique({
    where: { id: projectId },
    include: {
      characters: { include: { appearances: { orderBy: { appearanceIndex: 'asc' } } } },
      locations: { include: { images: { orderBy: { imageIndex: 'asc' } } } },
    },
  })

  if (!data) {
    throw new Error(`Project not found: ${projectId}`)
  }

  return data
    ? {
      ...data,
      directorStyleDoc: userId
        ? await resolveProjectDirectorStyleDoc({ projectId, userId })
        : parseDirectorStyleDoc((data as { directorStyleDoc?: string | null }).directorStyleDoc),
    }
    : data
}

export function parsePanelCharacterReferences(value: string | null | undefined): PanelCharacterReference[] {
  return parseStoryboardPanelCharacterReferences(value) as PanelCharacterReference[]
}

function formatPanelReferenceIssue(issues: PanelReferenceImageDiagnostic[]) {
  return issues
    .map((issue) => {
      const subject = issue.kind === 'character'
        ? `${issue.name || issue.characterId || 'unknown'}:${issue.appearance || issue.appearanceId || 'appearance'}`
        : issue.name || issue.kind
      return `${issue.kind}:${subject}:${issue.issue || 'invalid'}`
    })
    .join('; ')
}

function pushIssue(
  collection: PanelReferenceImageCollection,
  issue: PanelReferenceImageDiagnostic,
) {
  collection.diagnostics.push(issue)
  collection.issues.push(issue)
}

export async function collectPanelReferenceImagesWithDiagnostics(
  projectData: NovelProjectData,
  panel: PanelLike,
  options: { strict?: boolean } = {},
): Promise<PanelReferenceImageCollection> {
  const collection: PanelReferenceImageCollection = {
    refs: [],
    diagnostics: [],
    issues: [],
    expectedCharacterReferenceCount: 0,
  }

  const pushRef = (diagnostic: PanelReferenceImageDiagnostic, signedUrl: string) => {
    collection.refs.push(signedUrl)
    collection.diagnostics.push({
      ...diagnostic,
      inputIndex: collection.refs.length - 1,
      signedUrl,
      issue: null,
    })
  }

  const sketch = toSignedUrlIfCos(panel.sketchImageUrl, 3600)
  if (sketch) pushRef({ kind: 'sketch', inputIndex: null, sourceUrl: panel.sketchImageUrl || null }, sketch)

  const panelCharacters = parsePanelCharacterReferences(panel.characters)
  for (const item of panelCharacters) {
    collection.expectedCharacterReferenceCount += 1
    const character = findCharacterForStoryboardReference(
      projectData.characters || [],
      item as StoryboardPanelCharacterReference,
    )
    if (!character) {
      pushIssue(collection, {
        kind: 'character',
        inputIndex: null,
        name: item.name,
        characterId: item.characterId || null,
        appearance: item.appearance || null,
        appearanceId: item.appearanceId || null,
        issue: 'character_not_found',
      })
      continue
    }

    const appearances = character.appearances || []
    const appearance = findAppearanceForStoryboardReference(
      appearances,
      item as StoryboardPanelCharacterReference,
    )
    if (!appearance) {
      pushIssue(collection, {
        kind: 'character',
        inputIndex: null,
        name: character.name,
        characterId: character.id || item.characterId || null,
        appearance: item.appearance || null,
        appearanceId: item.appearanceId || null,
        issue: 'appearance_not_found',
      })
      continue
    }

    const imageUrls = parseImageUrls(appearance.imageUrls, 'characterAppearance.imageUrls')
    const selectedIndex = appearance.selectedIndex
    const selectedUrl = selectedIndex !== null && selectedIndex !== undefined ? imageUrls[selectedIndex] : null
    const key = selectedIndex !== null && selectedIndex !== undefined
      ? selectedUrl
      : imageUrls[0] || appearance.imageUrl
    if (!key) {
      pushIssue(collection, {
        kind: 'character',
        inputIndex: null,
        name: character.name,
        characterId: character.id || item.characterId || null,
        appearance: appearance.changeReason || item.appearance || null,
        appearanceId: appearance.id || item.appearanceId || null,
        selectedIndex,
        issue: 'reference_image_missing',
      })
      continue
    }
    const signed = toSignedUrlIfCos(key, 3600)
    if (!signed) {
      pushIssue(collection, {
        kind: 'character',
        inputIndex: null,
        name: character.name,
        characterId: character.id || item.characterId || null,
        appearance: appearance.changeReason || item.appearance || null,
        appearanceId: appearance.id || item.appearanceId || null,
        selectedIndex,
        sourceUrl: key,
        issue: 'reference_url_not_signable',
      })
      continue
    }
    pushRef({
      kind: 'character',
      inputIndex: null,
      name: character.name,
      characterId: character.id || item.characterId || null,
      appearance: appearance.changeReason || item.appearance || null,
      appearanceId: appearance.id || item.appearanceId || null,
      selectedIndex,
      sourceUrl: key,
    }, signed)
  }

  if (panel.location) {
    const location = (projectData.locations || []).find((loc) => loc.name.toLowerCase() === panel.location!.toLowerCase())
    if (location) {
      const images = location.images || []
      const selected = images.find((img) => img.isSelected) || images[0]
      const signed = toSignedUrlIfCos(selected?.imageUrl, 3600)
      if (signed) {
        pushRef({
          kind: 'location',
          inputIndex: null,
          name: location.name,
          sourceUrl: selected?.imageUrl || null,
        }, signed)
      }
    }
  }

  if (options.strict && collection.issues.some((issue) => issue.kind === 'character')) {
    throw new Error(`PANEL_CHARACTER_REFERENCE_INVALID:${formatPanelReferenceIssue(collection.issues)}`)
  }

  return collection
}

export async function collectPanelReferenceImages(projectData: NovelProjectData, panel: PanelLike) {
  return (await collectPanelReferenceImagesWithDiagnostics(projectData, panel)).refs
}
