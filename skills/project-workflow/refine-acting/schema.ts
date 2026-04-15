import { z } from 'zod'

export const refineActingInputSchema = z.object({
  clipId: z.string().min(1),
  phase1Panels: z.array(z.record(z.unknown())),
  clipContext: z.object({}).passthrough(),
  locale: z.enum(['zh', 'en']).optional(),
  runStep: z.function(),
  stepIndex: z.number().int().positive(),
  stepTotal: z.number().int().positive(),
})

export const refineActingOutputSchema = z.array(z.record(z.unknown()))
