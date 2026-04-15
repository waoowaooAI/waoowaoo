import { z } from 'zod'

export const generateVoiceLinesInputSchema = z.object({
  runStep: z.function(),
  locale: z.enum(['zh', 'en']),
  novelText: z.string(),
  project: z.object({}).passthrough(),
  clipPanels: z.array(z.object({
    clipId: z.string(),
    clipIndex: z.number().int().positive(),
    finalPanels: z.array(z.record(z.unknown())),
  })),
  stepIndex: z.number().int().positive(),
  stepTotal: z.number().int().positive(),
})

export const generateVoiceLinesOutputSchema = z.array(z.record(z.unknown()))
