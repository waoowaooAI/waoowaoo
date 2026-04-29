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

export interface DirectorStyleCharacterBlock {
  temperament: string
  expression: string
  pose: string
  wardrobeTexture: string
  cameraDistance: string
  imagePrompt: string
  avoid: string
}

export interface DirectorStyleLocationBlock {
  spaceMood: string
  composition: string
  lightSource: string
  materials: string
  colorTemperature: string
  depth: string
  imagePrompt: string
  avoid: string
}

export interface DirectorStylePropBlock {
  shapeLanguage: string
  materialAging: string
  placement: string
  scale: string
  lighting: string
  imagePrompt: string
  avoid: string
}

export interface DirectorStyleStoryboardPlanBlock {
  shotSelection: string
  revealOrder: string
  subjectContinuity: string
  sceneCoverage: string
  avoid: string
}

export interface DirectorStyleCinematographyBlock {
  shotSize: string
  lens: string
  angle: string
  cameraHeight: string
  depthOfField: string
  composition: string
  lighting: string
  avoid: string
}

export interface DirectorStyleActingBlock {
  expression: string
  gaze: string
  posture: string
  gesture: string
  motionState: string
  interactionDistance: string
  avoid: string
}

export interface DirectorStyleStoryboardDetailBlock {
  frameComposition: string
  cameraMovement: string
  focalPoint: string
  foregroundBackground: string
  transitionCue: string
  imagePrompt: string
  avoid: string
}

export interface DirectorStyleImageBlock {
  prompt: string
  negativePrompt: string
  lighting: string
  color: string
  composition: string
  texture: string
  atmosphere: string
}

export interface DirectorStyleVideoBlock {
  cameraMotion: string
  motionSpeed: string
  subjectMotion: string
  rhythm: string
  stability: string
  transition: string
  avoid: string
}

export interface DirectorStyleDoc {
  character: DirectorStyleCharacterBlock
  location: DirectorStyleLocationBlock
  prop: DirectorStylePropBlock
  storyboardPlan: DirectorStyleStoryboardPlanBlock
  cinematography: DirectorStyleCinematographyBlock
  acting: DirectorStyleActingBlock
  storyboardDetail: DirectorStyleStoryboardDetailBlock
  image: DirectorStyleImageBlock
  video: DirectorStyleVideoBlock
}

export type DirectorStyleBlock = DirectorStyleDoc[DirectorStyleDocField]

export const DIRECTOR_STYLE_BLOCK_FIELD_KEYS = {
  character: ['temperament', 'expression', 'pose', 'wardrobeTexture', 'cameraDistance', 'imagePrompt', 'avoid'],
  location: ['spaceMood', 'composition', 'lightSource', 'materials', 'colorTemperature', 'depth', 'imagePrompt', 'avoid'],
  prop: ['shapeLanguage', 'materialAging', 'placement', 'scale', 'lighting', 'imagePrompt', 'avoid'],
  storyboardPlan: ['shotSelection', 'revealOrder', 'subjectContinuity', 'sceneCoverage', 'avoid'],
  cinematography: ['shotSize', 'lens', 'angle', 'cameraHeight', 'depthOfField', 'composition', 'lighting', 'avoid'],
  acting: ['expression', 'gaze', 'posture', 'gesture', 'motionState', 'interactionDistance', 'avoid'],
  storyboardDetail: ['frameComposition', 'cameraMovement', 'focalPoint', 'foregroundBackground', 'transitionCue', 'imagePrompt', 'avoid'],
  image: ['prompt', 'negativePrompt', 'lighting', 'color', 'composition', 'texture', 'atmosphere'],
  video: ['cameraMotion', 'motionSpeed', 'subjectMotion', 'rhythm', 'stability', 'transition', 'avoid'],
} as const satisfies Record<DirectorStyleDocField, readonly string[]>
