import { z } from 'zod'

export const analyzeLocationsInputSchema = z.object({
  content: z.string().min(1),
  baseLocations: z.array(z.string()),
  locale: z.enum(['zh', 'en']).optional(),
  runStep: z.function(),
})

export const analyzeLocationsOutputSchema = z.object({
  parsedObject: z.record(z.unknown()),
  rows: z.array(z.record(z.unknown())),
  stepOutput: z.object({
    text: z.string(),
    reasoning: z.string(),
  }),
})
