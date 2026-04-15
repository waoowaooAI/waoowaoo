export const analyzeLocationsResources = {
  models: ['analysisModel'],
  promptFiles: [
    'skills/project-workflow/analyze-locations/prompts/template.zh.txt',
    'skills/project-workflow/analyze-locations/prompts/template.en.txt',
  ],
  loaders: ['episode.novelText', 'project.locations'],
  toolAllowlist: ['executeAiTextStep'],
} as const
