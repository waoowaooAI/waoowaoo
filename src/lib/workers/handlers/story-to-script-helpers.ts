import { prisma } from '@/lib/prisma'
import { removeLocationPromptSuffix } from '@/lib/constants'
import type { StoryToScriptClipCandidate } from '@/lib/novel-promotion/story-to-script/orchestrator'

export type AnyObj = Record<string, unknown>

export function parseEffort(value: unknown): 'minimal' | 'low' | 'medium' | 'high' | null {
  if (value === 'minimal' || value === 'low' || value === 'medium' || value === 'high') return value
  return null
}

export function parseTemperature(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0.7
  return Math.max(0, Math.min(2, value))
}

export function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
}

export function resolveClipRecordId(clipMap: Map<string, string>, clipId: string): string | null {
  return clipMap.get(clipId) || null
}

export async function persistAnalyzedCharacters(params: {
  projectInternalId: string
  existingNames: Set<string>
  analyzedCharacters: Record<string, unknown>[]
}) {
  const created: Array<{ id: string; name: string }> = []

  for (const item of params.analyzedCharacters) {
    const name = asString(item.name).trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (params.existingNames.has(key)) continue

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

    const createdRow = await prisma.novelPromotionCharacter.create({
      data: {
        novelPromotionProjectId: params.projectInternalId,
        name,
        aliases: JSON.stringify(toStringArray(item.aliases)),
        introduction: asString(item.introduction) || null,
        profileData: JSON.stringify(profileData),
        profileConfirmed: false,
      },
      select: {
        id: true,
        name: true,
      },
    })

    params.existingNames.add(key)
    created.push(createdRow)
  }

  return created
}

export async function persistAnalyzedLocations(params: {
  projectInternalId: string
  existingNames: Set<string>
  analyzedLocations: Record<string, unknown>[]
}) {
  const created: Array<{ id: string; name: string }> = []
  const invalidKeywords = ['幻想', '抽象', '无明确', '空间锚点', '未说明', '不明确']

  for (const item of params.analyzedLocations) {
    const name = asString(item.name).trim()
    if (!name) continue

    const descriptions = toStringArray(item.descriptions)
    const mergedDescriptions = descriptions.length > 0
      ? descriptions
      : (asString(item.description) ? [asString(item.description)] : [])

    const firstDescription = mergedDescriptions[0] || ''
    const isInvalid = invalidKeywords.some((keyword) =>
      name.includes(keyword) || firstDescription.includes(keyword),
    )
    if (isInvalid) continue

    const key = name.toLowerCase()
    if (params.existingNames.has(key)) continue

    const location = await prisma.novelPromotionLocation.create({
      data: {
        novelPromotionProjectId: params.projectInternalId,
        name,
        summary: asString(item.summary) || null,
      },
      select: {
        id: true,
        name: true,
      },
    })

    const cleanDescriptions = mergedDescriptions.map((desc) => removeLocationPromptSuffix(desc || ''))
    for (let i = 0; i < cleanDescriptions.length; i += 1) {
      await prisma.locationImage.create({
        data: {
          locationId: location.id,
          imageIndex: i,
          description: cleanDescriptions[i],
        },
      })
    }

    params.existingNames.add(key)
    created.push(location)
  }

  return created
}

export async function persistClips(params: {
  episodeId: string
  clipList: StoryToScriptClipCandidate[]
}) {
  await prisma.novelPromotionClip.deleteMany({
    where: { episodeId: params.episodeId },
  })

  const createdClips: Array<{ id: string; clipKey: string }> = []
  for (const clip of params.clipList) {
    const created = await prisma.novelPromotionClip.create({
      data: {
        episodeId: params.episodeId,
        startText: clip.startText,
        endText: clip.endText,
        summary: clip.summary,
        location: clip.location,
        characters: clip.characters.length > 0 ? JSON.stringify(clip.characters) : null,
        content: clip.content,
      },
      select: {
        id: true,
      },
    })
    createdClips.push({ id: created.id, clipKey: clip.id })
  }

  return createdClips
}
