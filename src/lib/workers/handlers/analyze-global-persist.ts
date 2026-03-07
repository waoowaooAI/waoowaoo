import { prisma } from '@/lib/prisma'
import { removeLocationPromptSuffix } from '@/lib/constants'
import {
  isInvalidLocation,
  readText,
  toStringArray,
  type AnalyzeGlobalCharactersData,
  type AnalyzeGlobalLocationsData,
  type CharacterBrief,
} from './analyze-global-parse'

export type AnalyzeGlobalStats = {
  totalChunks: number
  processedChunks: number
  newCharacters: number
  updatedCharacters: number
  newLocations: number
  skippedCharacters: number
  skippedLocations: number
}

export function createAnalyzeGlobalStats(totalChunks: number): AnalyzeGlobalStats {
  return {
    totalChunks,
    processedChunks: 0,
    newCharacters: 0,
    updatedCharacters: 0,
    newLocations: 0,
    skippedCharacters: 0,
    skippedLocations: 0,
  }
}

export async function persistAnalyzeGlobalChunk(params: {
  projectInternalId: string
  charactersData: AnalyzeGlobalCharactersData
  locationsData: AnalyzeGlobalLocationsData
  existingCharacters: CharacterBrief[]
  existingCharacterNames: string[]
  existingLocationNames: string[]
  existingLocationInfo: string[]
  stats: AnalyzeGlobalStats
}) {
  for (const char of params.charactersData.new_characters || []) {
    const name = readText(char.name).trim()
    const aliases = toStringArray(char.aliases)
    if (!name) continue

    const nameExists = params.existingCharacterNames.some((item) => item.toLowerCase() === name.toLowerCase())
    const aliasExists = aliases.some((alias) =>
      params.existingCharacterNames.some((item) => item.toLowerCase() === alias.toLowerCase()),
    )
    if (nameExists || aliasExists) {
      params.stats.skippedCharacters += 1
      continue
    }

    try {
      const profileData = {
        role_level: char.role_level,
        archetype: char.archetype,
        personality_tags: toStringArray(char.personality_tags),
        era_period: char.era_period,
        social_class: char.social_class,
        occupation: char.occupation,
        costume_tier: char.costume_tier,
        suggested_colors: toStringArray(char.suggested_colors),
        primary_identifier: char.primary_identifier,
        visual_keywords: toStringArray(char.visual_keywords),
        gender: char.gender,
        age_range: char.age_range,
      }

      const created = await prisma.novelPromotionCharacter.create({
        data: {
          novelPromotionProjectId: params.projectInternalId,
          name,
          aliases: JSON.stringify(aliases),
          introduction: readText(char.introduction),
          profileData: JSON.stringify(profileData),
          profileConfirmed: false,
        },
        select: {
          id: true,
        },
      })

      params.existingCharacters.push({
        id: created.id,
        name,
        aliases,
        introduction: readText(char.introduction),
      })
      params.existingCharacterNames.push(name, ...aliases)
      params.stats.newCharacters += 1
    } catch {
      params.stats.skippedCharacters += 1
    }
  }

  for (const update of params.charactersData.updated_characters || []) {
    const targetName = readText(update.name).trim()
    if (!targetName) continue
    const existing = params.existingCharacters.find((item) => item.name.toLowerCase() === targetName.toLowerCase())
    if (!existing) continue

    try {
      const updateData: Record<string, unknown> = {}
      const updatedIntroduction = readText(update.updated_introduction).trim()
      if (updatedIntroduction) {
        updateData.introduction = updatedIntroduction
        existing.introduction = updatedIntroduction
      }

      const updatedAliases = toStringArray(update.updated_aliases)
      if (updatedAliases.length > 0) {
        const newAliases = updatedAliases.filter(
          (item) => !existing.aliases.some((alias) => alias.toLowerCase() === item.toLowerCase()),
        )
        if (newAliases.length > 0) {
          const merged = [...existing.aliases, ...newAliases]
          updateData.aliases = JSON.stringify(merged)
          existing.aliases = merged
          params.existingCharacterNames.push(...newAliases)
        }
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.novelPromotionCharacter.update({
          where: { id: existing.id },
          data: updateData,
        })
        params.stats.updatedCharacters += 1
      }
    } catch {
      // skip failed update
    }
  }

  for (const loc of params.locationsData.locations || []) {
    const name = readText(loc.name).trim()
    const summary = readText(loc.summary)
    if (!name) continue
    if (isInvalidLocation(name, summary)) {
      params.stats.skippedLocations += 1
      continue
    }

    const exists = params.existingLocationNames.some((item) => item.toLowerCase() === name.toLowerCase())
    if (exists) {
      params.stats.skippedLocations += 1
      continue
    }

    try {
      const descriptionsRaw = Array.isArray(loc.descriptions)
        ? (loc.descriptions as unknown[])
        : (readText(loc.description) ? [readText(loc.description)] : [])
      const descriptions = descriptionsRaw.map((item) => readText(item)).filter(Boolean)
      const cleanDescriptions = descriptions.map((item) => removeLocationPromptSuffix(item))

      const created = await prisma.novelPromotionLocation.create({
        data: {
          novelPromotionProjectId: params.projectInternalId,
          name,
          summary: summary || null,
        },
        select: {
          id: true,
        },
      })

      for (let j = 0; j < cleanDescriptions.length; j += 1) {
        await prisma.locationImage.create({
          data: {
            locationId: created.id,
            imageIndex: j,
            description: cleanDescriptions[j],
          },
        })
      }

      params.existingLocationNames.push(name)
      params.existingLocationInfo.push(summary ? `${name}(${summary})` : name)
      params.stats.newLocations += 1
    } catch {
      params.stats.skippedLocations += 1
    }
  }
}
