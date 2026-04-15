import { z } from 'zod'

export const planStoryboardPhase1InputSchema = z.object({
  clipContext: z.object({
    clip: z.object({
      id: z.string(),
    }).passthrough(),
  }).passthrough(),
  project: z.object({
    charactersLibName: z.string(),
    locationsLibName: z.string(),
    charactersIntroduction: z.string(),
  }).passthrough(),
  locale: z.enum(['zh', 'en']).optional(),
  runStep: z.function(),
  stepIndex: z.number().int().positive(),
  stepTotal: z.number().int().positive(),
})

export const planStoryboardPhase1OutputSchema = z.array(z.record(z.unknown()))
