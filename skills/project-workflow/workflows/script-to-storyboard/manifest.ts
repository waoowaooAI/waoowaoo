import { z } from 'zod'
import { getProjectWorkflowMachine } from '@/lib/skill-system/project-workflow-machine'
import type { WorkflowPackage } from '@/lib/skill-system/types'

export const scriptToStoryboardWorkflowInputSchema = z.object({
  concurrency: z.number().int().positive().optional(),
  locale: z.enum(['zh', 'en']).optional(),
  clips: z.array(z.object({
    id: z.string(),
    content: z.string().nullable(),
    screenplay: z.string().nullable(),
  }).passthrough()),
  projectData: z.object({
    characters: z.array(z.record(z.unknown())),
    locations: z.array(z.record(z.unknown())),
    props: z.array(z.record(z.unknown())).optional(),
  }),
  novelText: z.string(),
  runStep: z.function(),
})

export const scriptToStoryboardWorkflowOutputSchema = z.object({
  summary: z.object({
    clipCount: z.number().int().nonnegative(),
    totalPanelCount: z.number().int().nonnegative(),
    totalStepCount: z.number().int().positive(),
  }),
}).passthrough()

export const scriptToStoryboardWorkflowManifest: WorkflowPackage['manifest'] =
  getProjectWorkflowMachine('script-to-storyboard').manifest
