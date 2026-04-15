import { z } from 'zod'

export const analyzeCharactersInputSchema = z.object({
  content: z.string().min(1),
  baseCharacters: z.array(z.string()),
  baseCharacterIntroductions: z.array(z.object({
    name: z.string().min(1),
    introduction: z.string().nullable().optional(),
  })),
  locale: z.enum(['zh', 'en']).optional(),
  runStep: z.function(),
})

export const analyzeCharactersOutputSchema = z.object({
  parsedObject: z.record(z.unknown()),
  rows: z.array(z.record(z.unknown())),
  stepOutput: z.object({
    text: z.string(),
    reasoning: z.string(),
  }),
})

export const analyzeCharactersDataPartSchema = z.object({
  skillId: z.literal('analyze-characters'),
  characterCount: z.number().int().nonnegative(),
})
