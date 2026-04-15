import { z } from 'zod'

export const generateScreenplayInputSchema = z.object({
  clipList: z.array(z.object({
    id: z.string(),
    content: z.string(),
  }).passthrough()),
  prepared: z.object({
    charactersLibName: z.string(),
    locationsLibName: z.string(),
    propsLibName: z.string(),
    charactersIntroduction: z.string(),
  }).passthrough(),
  locale: z.enum(['zh', 'en']).optional(),
  runStep: z.function(),
  concurrency: z.number().int().positive(),
})

export const generateScreenplayOutputSchema = z.array(z.object({
  clipId: z.string(),
  success: z.boolean(),
  sceneCount: z.number().int().nonnegative(),
}).passthrough())
