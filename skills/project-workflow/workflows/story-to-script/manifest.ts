import { z } from 'zod'
import { getProjectWorkflowMachine } from '@/lib/skill-system/project-workflow-machine'
import type { WorkflowPackage } from '@/lib/skill-system/types'

export const storyToScriptWorkflowInputSchema = z.object({
  concurrency: z.number().int().positive().optional(),
  locale: z.enum(['zh', 'en']).optional(),
  content: z.string().min(1),
  baseCharacters: z.array(z.string()),
  baseLocations: z.array(z.string()),
  baseProps: z.array(z.string()).optional(),
  baseCharacterIntroductions: z.array(z.object({
    name: z.string().min(1),
    introduction: z.string().nullable().optional(),
  })),
  runStep: z.function(),
  onStepError: z.function().optional(),
  onLog: z.function().optional(),
})

export const storyToScriptWorkflowOutputSchema = z.object({
  summary: z.object({
    characterCount: z.number().int().nonnegative(),
    locationCount: z.number().int().nonnegative(),
    propCount: z.number().int().nonnegative(),
    clipCount: z.number().int().nonnegative(),
    screenplaySuccessCount: z.number().int().nonnegative(),
    screenplayFailedCount: z.number().int().nonnegative(),
    totalScenes: z.number().int().nonnegative(),
  }),
}).passthrough()

export const storyToScriptWorkflowManifest: WorkflowPackage['manifest'] =
  getProjectWorkflowMachine('story-to-script').manifest
