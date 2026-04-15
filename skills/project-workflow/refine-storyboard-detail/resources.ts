export const refineStoryboardDetailResources = {
  models: ['analysisModel'],
  promptFiles: [
    'skills/project-workflow/refine-storyboard-detail/prompts/template.zh.txt',
    'skills/project-workflow/refine-storyboard-detail/prompts/template.en.txt',
  ],
  loaders: ['storyboard.phase1', 'storyboard.phase2.cinematography', 'storyboard.phase2.acting'],
  toolAllowlist: ['executeAiTextStep'],
} as const
