export const refineActingResources = {
  models: ['analysisModel'],
  promptFiles: [
    'skills/project-workflow/refine-acting/prompts/template.zh.txt',
    'skills/project-workflow/refine-acting/prompts/template.en.txt',
  ],
  loaders: ['storyboard.phase1', 'project.characters'],
  toolAllowlist: ['executeAiTextStep'],
} as const
