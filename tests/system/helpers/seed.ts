import { randomUUID } from 'node:crypto'
import { prisma } from '../../helpers/prisma'
import {
  createFixtureEpisode,
  createFixtureNovelProject,
  createFixtureProject,
  createFixtureUser,
} from '../../helpers/fixtures'

function nextSuffix() {
  return randomUUID().slice(0, 8)
}

export async function seedMinimalDomainState() {
  const user = await createFixtureUser()
  const project = await createFixtureProject(user.id)
  const novelProject = await createFixtureNovelProject(project.id)
  const episode = await createFixtureEpisode(novelProject.id)

  const clip = await prisma.projectClip.create({
    data: {
      episodeId: episode.id,
      summary: 'seed clip',
      content: 'seed clip content',
      screenplay: 'seed screenplay',
      location: 'Office',
      characters: JSON.stringify(['Narrator']),
    },
  })

  const storyboard = await prisma.projectStoryboard.create({
    data: {
      episodeId: episode.id,
      clipId: clip.id,
      panelCount: 1,
    },
  })

  const panel = await prisma.projectPanel.create({
    data: {
      storyboardId: storyboard.id,
      panelIndex: 0,
      panelNumber: 1,
      shotType: '中景',
      cameraMove: '固定',
      description: 'seed panel',
      videoPrompt: 'seed video prompt',
      location: 'Office',
      characters: JSON.stringify(['Narrator']),
      imageUrl: 'https://provider.example/panel.jpg',
    },
  })

  const character = await prisma.projectCharacter.create({
    data: {
      projectId: project.id,
      name: 'Narrator',
    },
  })

  const appearance = await prisma.characterAppearance.create({
    data: {
      characterId: character.id,
      appearanceIndex: 0,
      changeReason: 'default',
      description: 'Narrator appearance',
      imageUrls: JSON.stringify(['images/character-seed.jpg']),
      imageUrl: 'images/character-seed.jpg',
      selectedIndex: 0,
    },
  })

  const location = await prisma.projectLocation.create({
    data: {
      projectId: project.id,
      name: 'Office',
      summary: 'Office summary',
    },
  })

  const locationImage = await prisma.locationImage.create({
    data: {
      locationId: location.id,
      imageIndex: 0,
      description: 'Office image',
      imageUrl: 'images/location-seed.jpg',
      isSelected: true,
    },
  })

  const voiceLine = await prisma.projectVoiceLine.create({
    data: {
      episodeId: episode.id,
      lineIndex: 1,
      speaker: 'Narrator',
      content: 'Hello world',
      matchedPanelId: panel.id,
      matchedStoryboardId: storyboard.id,
      matchedPanelIndex: panel.panelIndex,
    },
  })

  await prisma.projectEpisode.update({
    where: { id: episode.id },
    data: {
      speakerVoices: JSON.stringify({
        Narrator: {
          provider: 'fal',
          voiceType: 'uploaded',
          audioUrl: 'https://provider.example/reference.wav',
        },
      }),
    },
  })

  const secondaryPanel = await prisma.projectPanel.create({
    data: {
      storyboardId: storyboard.id,
      panelIndex: 1,
      panelNumber: 2,
      shotType: '近景',
      cameraMove: '推镜',
      description: 'secondary panel',
      videoPrompt: 'secondary prompt',
      location: 'Office',
      characters: JSON.stringify(['Narrator']),
    },
  })

  await prisma.projectStoryboard.update({
    where: { id: storyboard.id },
    data: { panelCount: 2 },
  })

  const foreignStoryboard = await prisma.projectStoryboard.create({
    data: {
      episodeId: episode.id,
      clipId: (await prisma.projectClip.create({
        data: {
          episodeId: episode.id,
          summary: 'foreign clip',
          content: 'foreign clip content',
          screenplay: 'foreign screenplay',
          location: 'Office',
          characters: JSON.stringify(['Narrator']),
        },
      })).id,
      panelCount: 1,
    },
  })

  const foreignPanel = await prisma.projectPanel.create({
    data: {
      id: `panel-foreign-${nextSuffix()}`,
      storyboardId: foreignStoryboard.id,
      panelIndex: 0,
      panelNumber: 1,
      shotType: '远景',
      cameraMove: '固定',
      description: 'foreign panel',
      videoPrompt: 'foreign prompt',
      location: 'Office',
      characters: JSON.stringify(['Narrator']),
    },
  })

  return {
    user,
    project,
    novelProject,
    episode,
    clip,
    storyboard,
    panel,
    secondaryPanel,
    foreignStoryboard,
    foreignPanel,
    character,
    appearance,
    location,
    locationImage,
    voiceLine,
  }
}
