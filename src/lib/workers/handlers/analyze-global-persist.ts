import { prisma } from '@/lib/prisma'
import { removeLocationPromptSuffix } from '@/lib/constants'
import {
  isInvalidLocation,
  readText,
  toStringArray,
  type AnalyzeGlobalCharactersData,
  type AnalyzeGlobalLocationsData,
  type AnalyzeGlobalPropsData,
  type CharacterBrief,
} from './analyze-global-parse'
import { seedProjectLocationBackedImageSlots } from '@/lib/assets/services/location-backed-assets'
import { normalizeLocationAvailableSlots } from '@/lib/location-available-slots'
import { resolvePropVisualDescription } from '@/lib/assets/prop-description'

export type AnalyzeGlobalStats = {
  totalChunks: number
  processedChunks: number
  newCharacters: number
  updatedCharacters: number
  newLocations: number
  newProps: number
  skippedCharacters: number
  skippedLocations: number
  skippedProps: number
}

export function createAnalyzeGlobalStats(totalChunks: number): AnalyzeGlobalStats {
  return {
    totalChunks,
    processedChunks: 0,
    newCharacters: 0,
    updatedCharacters: 0,
    newLocations: 0,
    newProps: 0,
    skippedCharacters: 0,
    skippedLocations: 0,
    skippedProps: 0,
  }
}

export async function persistAnalyzeGlobalChunk(params: {
  projectId: string
  charactersData: AnalyzeGlobalCharactersData
  locationsData: AnalyzeGlobalLocationsData
  propsData: AnalyzeGlobalPropsData
  existingCharacters: CharacterBrief[]
  existingCharacterNames: string[]
  existingLocationNames: string[]
  existingLocationInfo: string[]
  existingPropNames: string[]
  stats: AnalyzeGlobalStats
}) {
  const createdCharacters: Array<{ id: string }> = []

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

      const created = await prisma.projectCharacter.create({
        data: {
          projectId: params.projectId,
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
      createdCharacters.push(created)
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
        await prisma.projectCharacter.update({
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
      const availableSlots = normalizeLocationAvailableSlots(loc.available_slots)

      const created = await prisma.projectLocation.create({
        data: {
          projectId: params.projectId,
          name,
          summary: summary || null,
        },
        select: {
          id: true,
        },
      })

      await seedProjectLocationBackedImageSlots({
        locationId: created.id,
        descriptions: cleanDescriptions,
        fallbackDescription: summary || name,
        availableSlots,
      })

      params.existingLocationNames.push(name)
      params.existingLocationInfo.push(summary ? `${name}(${summary})` : name)
      params.stats.newLocations += 1
    } catch {
      params.stats.skippedLocations += 1
    }
  }

  for (const prop of params.propsData.props || []) {
    const name = readText(prop.name).trim()
    const summary = readText(prop.summary).trim()
    const description = resolvePropVisualDescription({
      name,
      summary,
      description: readText(prop.description).trim(),
    })
    if (!name || !summary || !description) {
      params.stats.skippedProps += 1
      continue
    }

    const exists = params.existingPropNames.some((item) => item.toLowerCase() === name.toLowerCase())
    if (exists) {
      params.stats.skippedProps += 1
      continue
    }

    try {
      const created = await prisma.projectLocation.create({
        data: {
          projectId: params.projectId,
          name,
          summary,
          assetKind: 'prop',
        },
      })
      await seedProjectLocationBackedImageSlots({
        locationId: created.id,
        descriptions: [description],
        fallbackDescription: description,
        availableSlots: [],
      })
      params.existingPropNames.push(name)
      params.stats.newProps += 1
    } catch {
      params.stats.skippedProps += 1
    }
  }

  return {
    createdCharacters,
  }
}
