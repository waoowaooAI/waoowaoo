import horrorSuspenseDirectorStyleDoc from './presets/horror-suspense.json'
import { DIRECTOR_STYLE_PRESET_IDS, type DirectorStylePresetId } from './ids'
import type { DirectorStyleDoc } from './types'

const DIRECTOR_STYLE_PRESET_DOCS: Record<DirectorStylePresetId, DirectorStyleDoc> = {
  [DIRECTOR_STYLE_PRESET_IDS.HORROR_SUSPENSE]: horrorSuspenseDirectorStyleDoc,
}

export function isDirectorStylePresetId(value: string): value is DirectorStylePresetId {
  return value === DIRECTOR_STYLE_PRESET_IDS.HORROR_SUSPENSE
}

export function buildDirectorStyleDoc(presetId: DirectorStylePresetId): DirectorStyleDoc {
  const doc = DIRECTOR_STYLE_PRESET_DOCS[presetId]
  if (!doc) {
    throw new Error(`DIRECTOR_STYLE_PRESET_UNSUPPORTED:${presetId}`)
  }

  return {
    character: { ...doc.character },
    location: { ...doc.location },
    prop: { ...doc.prop },
    storyboardPlan: { ...doc.storyboardPlan },
    cinematography: { ...doc.cinematography },
    acting: { ...doc.acting },
    storyboardDetail: { ...doc.storyboardDetail },
    image: { ...doc.image },
    video: { ...doc.video },
  }
}
