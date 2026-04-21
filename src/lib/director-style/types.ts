export const DIRECTOR_STYLE_DOC_FIELDS = [
  'character',
  'location',
  'prop',
  'storyboardPlan',
  'cinematography',
  'acting',
  'storyboardDetail',
  'image',
  'video',
] as const

export type DirectorStyleDocField = (typeof DIRECTOR_STYLE_DOC_FIELDS)[number]

export interface DirectorStyleGuidanceBlock {
  intent: string
  priorities: string[]
  avoid: string[]
  allowWhenHelpful: string[]
  judgement: string
}

export interface DirectorStyleDoc {
  character: DirectorStyleGuidanceBlock
  location: DirectorStyleGuidanceBlock
  prop: DirectorStyleGuidanceBlock
  storyboardPlan: DirectorStyleGuidanceBlock
  cinematography: DirectorStyleGuidanceBlock
  acting: DirectorStyleGuidanceBlock
  storyboardDetail: DirectorStyleGuidanceBlock
  image: DirectorStyleGuidanceBlock
  video: DirectorStyleGuidanceBlock
}
