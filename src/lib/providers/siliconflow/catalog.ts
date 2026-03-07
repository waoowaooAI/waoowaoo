import { registerOfficialModel } from '@/lib/providers/official/model-registry'
import type { OfficialModelModality } from '@/lib/providers/official/model-registry'

const SILICONFLOW_CATALOG: Readonly<Record<OfficialModelModality, readonly string[]>> = {
  llm: [],
  image: [],
  video: [],
  audio: [],
}

let initialized = false

export function ensureSiliconFlowCatalogRegistered(): void {
  if (initialized) return
  initialized = true
  for (const modality of Object.keys(SILICONFLOW_CATALOG) as OfficialModelModality[]) {
    for (const modelId of SILICONFLOW_CATALOG[modality]) {
      registerOfficialModel({ provider: 'siliconflow', modality, modelId })
    }
  }
}

export function listSiliconFlowCatalogModels(modality: OfficialModelModality): readonly string[] {
  ensureSiliconFlowCatalogRegistered()
  return SILICONFLOW_CATALOG[modality]
}
