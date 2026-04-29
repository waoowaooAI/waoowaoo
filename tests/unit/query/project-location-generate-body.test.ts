import { describe, expect, it } from 'vitest'
import { buildProjectLocationGenerateImageBody } from '@/lib/query/mutations/location-image-mutations'

describe('buildProjectLocationGenerateImageBody', () => {
  it('includes artStyle when generating a project location image', () => {
    expect(buildProjectLocationGenerateImageBody({
      projectId: 'project-1',
      locationId: 'location-1',
      count: 1,
      artStyle: 'japanese-anime',
    })).toEqual({
      scope: 'project',
      kind: 'location',
      projectId: 'project-1',
      imageIndex: undefined,
      count: 1,
      artStyle: 'japanese-anime',
    })
  })

  it('omits artStyle when project generation uses project visual style', () => {
    expect(buildProjectLocationGenerateImageBody({
      projectId: 'project-1',
      locationId: 'location-1',
      count: 1,
    })).toEqual({
      scope: 'project',
      kind: 'location',
      projectId: 'project-1',
      imageIndex: undefined,
      count: 1,
    })
  })
})
