import { describe, expect, it } from 'vitest'
import { buildProjectReadModel } from '@/lib/projects/build-project-read-model'

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
      directorStyleDoc: JSON.stringify({
        character: { intent: '角色风格', priorities: [], avoid: [], allowWhenHelpful: [], judgement: '按需判断' },
        location: { intent: '场景风格', priorities: [], avoid: [], allowWhenHelpful: [], judgement: '按需判断' },
        prop: { intent: '道具风格', priorities: [], avoid: [], allowWhenHelpful: [], judgement: '按需判断' },
        storyboardPlan: { intent: '分镜规划风格', priorities: [], avoid: [], allowWhenHelpful: [], judgement: '按需判断' },
        cinematography: { intent: '摄影风格', priorities: [], avoid: [], allowWhenHelpful: [], judgement: '按需判断' },
        acting: { intent: '表演风格', priorities: [], avoid: [], allowWhenHelpful: [], judgement: '按需判断' },
        storyboardDetail: { intent: '分镜细化风格', priorities: [], avoid: [], allowWhenHelpful: [], judgement: '按需判断' },
        image: { intent: '图片风格', priorities: [], avoid: [], allowWhenHelpful: [], judgement: '按需判断' },
        video: { intent: '视频风格', priorities: [], avoid: [], allowWhenHelpful: [], judgement: '按需判断' },
      }),
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
    expect(readModel.directorStyleDoc?.image.intent).toBe('图片风格')
    expect(readModel.episodes?.map((episode) => episode.id)).toEqual(['episode-1'])
    expect(readModel.locations?.map((location) => location.id)).toEqual(['location-1'])
    expect(readModel.props?.map((prop) => prop.id)).toEqual(['prop-1'])
    expect(readModel).not.toHaveProperty('projectData')
  })
})
