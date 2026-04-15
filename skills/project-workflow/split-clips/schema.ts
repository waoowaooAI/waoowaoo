import { z } from 'zod'

export const splitClipsInputSchema = z.object({
  content: z.string().min(1),
  locale: z.enum(['zh', 'en']).optional(),
  prepared: z.object({
    charactersLibName: z.string(),
    locationsLibName: z.string(),
    propsLibName: z.string(),
    charactersIntroduction: z.string(),
  }).passthrough(),
  runStep: z.function(),
})

export const splitClipsOutputSchema = z.object({
  splitStep: z.object({
    text: z.string(),
    reasoning: z.string(),
  }),
  clipList: z.array(z.object({
    id: z.string(),
    summary: z.string(),
    content: z.string(),
  }).passthrough()),
})
