import { describe, expect, it } from 'vitest'
import { buildProjectReadModel } from '@/lib/projects/build-project-read-model'
import { buildDirectorStyleDoc } from '@/lib/director-style'

describe('buildProjectReadModel', () => {
  it('flattens workflow data onto project and splits props from locations', () => {
    const project = {
      id: 'project-1',
      name: 'Project One',
      description: null,
      userId: 'user-1',
      createdAt: new Date('2026-04-15T00:00:00.000Z'),
      updatedAt: new Date('2026-04-15T00:00:00.000Z'),
      user: { id: 'user-1' },
    }

    const readModel = buildProjectReadModel(project, {
      analysisModel: 'llm::analysis',
      videoRatio: '9:16',
      directorStylePresetId: 'horror-suspense',
      directorStyleDoc: JSON.stringify(buildDirectorStyleDoc('horror-suspense')),
      importStatus: 'pending',
      episodes: [{
        id: 'episode-1',
        episodeNumber: 1,
        name: 'Episode 1',
        description: 'desc',
        novelText: 'text',
        audioUrl: null,
        srtContent: null,
        createdAt: new Date('2026-04-15T00:00:00.000Z'),
        updatedAt: new Date('2026-04-15T00:00:00.000Z'),
      }],
      locations: [
        { id: 'location-1', name: 'Palace', summary: null, images: [], assetKind: 'location' },
        { id: 'prop-1', name: 'Sword', summary: null, images: [], assetKind: 'prop' },
      ],
    })

    expect(readModel.analysisModel).toBe('llm::analysis')
    expect(readModel.importStatus).toBe('pending')
    expect(readModel.directorStylePresetId).toBe('horror-suspense')
    expect(readModel.directorStyleDoc?.image.prompt).toContain('low-key lighting')
    expect(readModel.episodes?.map((episode) => episode.id)).toEqual(['episode-1'])
    expect(readModel.locations?.map((location) => location.id)).toEqual(['location-1'])
    expect(readModel.props?.map((prop) => prop.id)).toEqual(['prop-1'])
    expect(readModel).not.toHaveProperty('projectData')
  })
})
