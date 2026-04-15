import { z } from 'zod'

export const analyzePropsInputSchema = z.object({
  content: z.string().min(1),
  baseProps: z.array(z.string()),
  locale: z.enum(['zh', 'en']).optional(),
  runStep: z.function(),
})

export const analyzePropsOutputSchema = z.object({
  parsedObject: z.record(z.unknown()),
  rows: z.array(z.record(z.unknown())),
  stepOutput: z.object({
    text: z.string(),
    reasoning: z.string(),
  }),
})
