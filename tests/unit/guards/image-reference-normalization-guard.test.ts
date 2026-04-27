import { describe, expect, it } from 'vitest'
import {
  NORMALIZATION_HELPER_ALLOWLIST,
  inspectImageReferenceNormalization,
} from '../../../scripts/guards/image-reference-normalization-guard.mjs'

describe('image reference normalization guard', () => {
  it('allows shared helper exceptions explicitly', () => {
    expect(NORMALIZATION_HELPER_ALLOWLIST.has('src/lib/workers/handlers/image-task-handler-shared.ts')).toBe(true)
    expect(
      inspectImageReferenceNormalization(
        'src/lib/workers/handlers/image-task-handler-shared.ts',
        'resolveImageSourceFromGeneration(job, { options: params.options })\nreferenceImages?: string[]',
      ),
    ).toEqual([])
  })

  it('passes handlers that normalize reference images before generation', () => {
    const content = `
      import { normalizeOptionalReferenceImagesForGeneration } from '@/lib/media/outbound-image'
      async function run() {
        const normalizedRefs = await normalizeOptionalReferenceImagesForGeneration(refs)
        return await resolveImageSourceFromGeneration(job, {
          options: {
            referenceImages: normalizedRefs,
          },
        })
      }
    `

    expect(
      inspectImageReferenceNormalization('src/lib/workers/handlers/panel-image-task-handler.ts', content),
    ).toEqual([])
  })

  it('flags handlers that send referenceImages without normalization markers', () => {
    const content = `
      async function run() {
        return await resolveImageSourceFromGeneration(job, {
          options: {
            referenceImages: refs,
          },
        })
      }
    `

    expect(
      inspectImageReferenceNormalization('src/lib/workers/handlers/bad-handler.ts', content),
    ).toEqual([
      'src/lib/workers/handlers/bad-handler.ts uses resolveImageSourceFromGeneration with referenceImages but does not reference normalizeReferenceImagesForGeneration/normalizeOptionalReferenceImagesForGeneration/normalizeToBase64ForGeneration/generateProjectLabeledImageToStorage/generateCleanImageToStorage',
    ])
  })
})
