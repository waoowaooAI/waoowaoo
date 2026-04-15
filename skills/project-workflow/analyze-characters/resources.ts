export const analyzeCharactersResources = {
  models: ['analysisModel'],
  promptFiles: [
    'skills/project-workflow/analyze-characters/prompts/template.zh.txt',
    'skills/project-workflow/analyze-characters/prompts/template.en.txt',
  ],
  loaders: ['episode.novelText', 'project.characters'],
  toolAllowlist: ['executeAiTextStep'],
} as const
