import { randomUUID } from 'node:crypto'
import { prisma } from './prisma'

function suffix() {
  return randomUUID().slice(0, 8)
}

export async function createFixtureUser() {
  const id = suffix()
  return await prisma.user.create({
    data: {
      name: `user_${id}`,
      email: `user_${id}@example.com`,
    },
  })
}

export async function createFixtureProject(userId: string, mode: 'novel-promotion' | 'general' = 'novel-promotion') {
  const id = suffix()
  return await prisma.project.create({
    data: {
      userId,
      mode,
      name: `project_${id}`,
    },
  })
}

export async function createFixtureNovelProject(projectId: string) {
  return await prisma.novelPromotionProject.create({
    data: {
      projectId,
      analysisModel: 'openrouter::anthropic/claude-sonnet-4',
      characterModel: 'fal::banana/character',
      locationModel: 'fal::banana/location',
      storyboardModel: 'fal::banana/storyboard',
      editModel: 'fal::banana/edit',
      videoModel: 'fal::seedance/video',
      videoRatio: '9:16',
      imageResolution: '2K',
    },
  })
}

export async function createFixtureGlobalCharacter(userId: string, folderId: string | null = null) {
  const id = suffix()
  return await prisma.globalCharacter.create({
    data: {
      userId,
      name: `character_${id}`,
      ...(folderId ? { folderId } : {}),
    },
  })
}

export async function createFixtureGlobalCharacterAppearance(characterId: string, appearanceIndex = 0) {
  return await prisma.globalCharacterAppearance.create({
    data: {
      characterId,
      appearanceIndex,
      changeReason: 'default',
      imageUrls: JSON.stringify(['images/test-0.jpg']),
      selectedIndex: 0,
    },
  })
}

export async function createFixtureGlobalLocation(userId: string, folderId: string | null = null) {
  const id = suffix()
  return await prisma.globalLocation.create({
    data: {
      userId,
      name: `location_${id}`,
      ...(folderId ? { folderId } : {}),
    },
  })
}

export async function createFixtureGlobalLocationImage(locationId: string, imageIndex = 0) {
  return await prisma.globalLocationImage.create({
    data: {
      locationId,
      imageIndex,
      imageUrl: `images/location-${suffix()}.jpg`,
      isSelected: imageIndex === 0,
    },
  })
}

export async function createFixtureEpisode(novelPromotionProjectId: string, episodeNumber = 1) {
  return await prisma.novelPromotionEpisode.create({
    data: {
      novelPromotionProjectId,
      episodeNumber,
      name: `Episode ${episodeNumber}`,
      novelText: 'test novel text',
    },
  })
}
