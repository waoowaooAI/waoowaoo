import { z } from 'zod'
import {
  CANVAS_LAYOUT_SCHEMA_VERSION,
  projectCanvasLayoutSnapshotSchema,
  type ProjectCanvasLayoutSnapshot,
} from './canvas-layout-contract'

export type CanvasLayoutReadWarningCode = 'schema_mismatch'

export interface CanvasLayoutReadResult {
  readonly layout: ProjectCanvasLayoutSnapshot | null
  readonly warningCode: CanvasLayoutReadWarningCode | null
}

const canvasLayoutReadResponseSchema = z.object({
  success: z.boolean(),
  layout: z.unknown().nullable(),
})

const canvasLayoutSchemaVersionProbe = z.object({
  schemaVersion: z.number().int(),
})

export function parseCanvasLayoutReadResponse(payload: unknown): CanvasLayoutReadResult {
  const response = canvasLayoutReadResponseSchema.safeParse(payload)
  if (!response.success || !response.data.success) {
    throw new Error('invalid canvas layout response')
  }

  if (!response.data.layout) {
    return {
      layout: null,
      warningCode: null,
    }
  }

  const versionProbe = canvasLayoutSchemaVersionProbe.safeParse(response.data.layout)
  if (
    versionProbe.success &&
    versionProbe.data.schemaVersion !== CANVAS_LAYOUT_SCHEMA_VERSION
  ) {
    return {
      layout: null,
      warningCode: 'schema_mismatch',
    }
  }

  const layout = projectCanvasLayoutSnapshotSchema.safeParse(response.data.layout)
  if (!layout.success) {
    throw new Error('invalid canvas layout snapshot')
  }

  return {
    layout: layout.data,
    warningCode: null,
  }
}
