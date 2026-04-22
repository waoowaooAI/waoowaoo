import horrorSuspenseDirectorStyleDoc from './presets/horror-suspense.json'
import { DIRECTOR_STYLE_PRESET_IDS, type DirectorStylePresetId } from './ids'
import type { DirectorStyleDoc, DirectorStyleGuidanceBlock } from './types'

const DIRECTOR_STYLE_PRESET_DOCS: Record<DirectorStylePresetId, DirectorStyleDoc> = {
  [DIRECTOR_STYLE_PRESET_IDS.HORROR_SUSPENSE]: horrorSuspenseDirectorStyleDoc,
}

export function isDirectorStylePresetId(value: string): value is DirectorStylePresetId {
  return value === DIRECTOR_STYLE_PRESET_IDS.HORROR_SUSPENSE
}

function cloneGuidanceBlock(block: DirectorStyleGuidanceBlock): DirectorStyleGuidanceBlock {
  return {
    intent: block.intent,
    priorities: [...block.priorities],
    avoid: [...block.avoid],
    allowWhenHelpful: [...block.allowWhenHelpful],
    judgement: block.judgement,
  }
}

export function buildDirectorStyleDoc(presetId: DirectorStylePresetId): DirectorStyleDoc {
  const doc = DIRECTOR_STYLE_PRESET_DOCS[presetId]
  if (!doc) {
    throw new Error(`DIRECTOR_STYLE_PRESET_UNSUPPORTED:${presetId}`)
  }

  return {
    character: cloneGuidanceBlock(doc.character),
    location: cloneGuidanceBlock(doc.location),
    prop: cloneGuidanceBlock(doc.prop),
    storyboardPlan: cloneGuidanceBlock(doc.storyboardPlan),
    cinematography: cloneGuidanceBlock(doc.cinematography),
    acting: cloneGuidanceBlock(doc.acting),
    storyboardDetail: cloneGuidanceBlock(doc.storyboardDetail),
    image: cloneGuidanceBlock(doc.image),
    video: cloneGuidanceBlock(doc.video),
  }
}
