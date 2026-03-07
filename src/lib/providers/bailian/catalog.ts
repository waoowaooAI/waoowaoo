import { registerOfficialModel } from '@/lib/providers/official/model-registry'
import type { OfficialModelModality } from '@/lib/providers/official/model-registry'

const BAILIAN_CATALOG: Readonly<Record<OfficialModelModality, readonly string[]>> = {
  llm: [
    'qwen3.5-plus',
    'qwen3.5-flash',
  ],
  image: [],
  video: [
    'wan2.6-i2v-flash',
    'wan2.6-i2v',
    'wan2.5-i2v-preview',
    'wan2.2-i2v-plus',
    'wan2.2-kf2v-flash',
    'wanx2.1-kf2v-plus',
  ],
  audio: [
    'qwen3-tts-vd-2026-01-26',
  ],
}

let initialized = false

export function ensureBailianCatalogRegistered(): void {
  if (initialized) return
  initialized = true
  for (const modality of Object.keys(BAILIAN_CATALOG) as OfficialModelModality[]) {
    for (const modelId of BAILIAN_CATALOG[modality]) {
      registerOfficialModel({ provider: 'bailian', modality, modelId })
    }
  }
}

export function listBailianCatalogModels(modality: OfficialModelModality): readonly string[] {
  ensureBailianCatalogRegistered()
  return BAILIAN_CATALOG[modality]
}
